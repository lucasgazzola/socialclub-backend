# 0001 · Servicio centralizado de notificaciones

- **Estado:** Aceptada
- **Fecha:** 03/10/2026 · **TASK-35** · DT-36 (base de US-26, DT-29, DT-31)
- **Código:** `src/notificaciones/`

## Contexto

US-26 necesitó avisar por email a los delegados y lo resolvió dentro del
módulo de alertas: `AlertasService` armaba el email, lo enviaba con nodemailer
y llevaba su propia tabla para no repetir avisos. Funcionaba, pero:

- Cada aviso nuevo (solicitud aprobada, compra confirmada, cuota vencida)
  hubiera repetido envío, deduplicación y formato de email.
- El equipo quiere sumar **notificaciones push** (y probablemente una bandeja
  en la app) sin reescribir a quien notifica.
- Si el SMTP fallaba, el aviso se perdía hasta la próxima corrida y no quedaba
  registro de qué se envió, a quién y con qué resultado.

Restricciones: un club con volumen bajo; infraestructura mínima (una API en
Azure Container Apps que escala a cero y un PostgreSQL); proveedor de email
gratuito (Brevo o Gmail por SMTP).

## Decisión

Un módulo `notificaciones` que expone **una sola** clase, la facade
`NotificacionesService`. Quien notifica dice *qué* avisar y *a quién*; el
servicio resuelve el *cómo*.

```ts
await notificaciones.notificar({
  plantilla: alertasPlantilla,          // qué tipo de aviso y cómo se ve
  datos: { alertas },
  destinatarios: [usuarioId, …],
  referencias: alertas.map((a) => a.clave), // idempotencia por ítem
});
```

```
Módulo de dominio ──► NotificacionesService (Facade)
                       ├─ Plantilla (Template Method)  — la aporta el dominio
                       ├─ tabla notificaciones (Outbox + idempotencia)
                       └─ CANALES (Registry) ─► Canal (Strategy)
                                                 └─ CanalEmail ─► ProveedorEmail (Adapter) ─► SMTP
                                                    CanalPush, CanalInterno (a futuro)
```

### Patrones aplicados

| Patrón | Dónde | Por qué |
|---|---|---|
| **Facade** | `NotificacionesService` | Los demás módulos solo conocen `notificar`, `filtrarNuevas`, `usuariosConRol` y `despacharPendientes`. Cambiar canales, proveedores o persistencia no los toca. |
| **Strategy** | `Canal` (`canales/canal.ts`), `CanalEmail` | Cada canal decide si está disponible, qué dirección usar y cómo enviar. Push o bandeja interna son otra implementación de la misma interfaz. |
| **Registry** (inyección de dependencias) | token `CANALES` en `NotificacionesModule` | La facade recorre los canales registrados, sin `switch`. Sumar un canal es registrarlo (principio abierto/cerrado). |
| **Adapter** | `ProveedorEmail` y `ProveedorSmtp` (token `PROVEEDOR_EMAIL`) | El canal de email no sabe de nodemailer. Pasar de SMTP a la API HTTP de Brevo es otro adaptador. |
| **Template Method** | `PlantillaEmail` (`plantillas/plantilla-email.ts`) | El método `email()` fija el esqueleto común (charset, título con la marca, introducción, enlace, pie) y cada tipo de aviso completa asunto, título, introducción y cuerpo. Ningún email se ve distinto del resto. |
| **Transactional Outbox** | tabla `notificaciones` | Cada notificación se **guarda primero** (PENDIENTE, con el contenido ya armado) y se envía después. Un envío fallido queda FALLIDA con el error y un canal sin configurar queda PENDIENTE; `despacharPendientes` reintenta ambas (hasta 5 intentos, dentro de 72 h). |
| **Idempotency key** | columna `referencias` (índice GIN) y `filtrarNuevas` | Las claves de los ítems avisados (por ejemplo, cada alerta) quedan en la notificación; un ítem ya referenciado no se vuelve a avisar, aunque la tarea corra dos veces. |

### Decisiones de detalle

- **Las plantillas viven en el módulo de dominio** (por ejemplo,
  `alertas/alertas-documentacion.plantilla.ts`) y se pasan a la facade. El
  contenido es del dominio; `notificaciones` no depende de ningún módulo de
  dominio.
- **Una notificación por destinatario y canal**, en vez de un email con todos
  en copia oculta: cada envío tiene su estado y su reintento, y la tabla sirve
  de historial por usuario (la base de una bandeja interna).
- **Canal sin configurar ≠ error.** Sin `SMTP_HOST` la notificación queda
  pendiente y se envía cuando se configure. En desarrollo no hace falta un
  servidor de correo.
- **Auditoría:** cada llamada a `notificar` registra una entrada en
  `registros_auditoria` (entidad `Notificacion`). El detalle de cada envío
  está en `notificaciones`.
- **Migración de US-26:** los avisos registrados en
  `alertas_documentacion_notificadas` pasan como notificaciones ENVIADAS con
  sus claves en `referencias`, y la tabla vieja se elimina. Lo ya avisado no
  se reenvía.

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| Seguir con un servicio de email por funcionalidad (como US-26) | Duplica envío, deduplicación y formato en cada aviso; push obligaría a tocar cada uno. |
| **Message broker** (RabbitMQ, Redis + BullMQ, Azure Service Bus) | Suma infraestructura y costo para un volumen de decenas de avisos por día. PostgreSQL como outbox alcanza y ya está. |
| **Eventos de dominio** (`@nestjs/event-emitter`) ahora | Los avisos actuales son por fecha (los dispara una tarea), no por eventos. Se suman con el primer aviso disparado por una acción (DT-29, DT-31), junto con el outbox: un evento en memoria se pierde si el proceso cae, el outbox no. |
| **Decorator** para reintentos (`CanalConReintentos`) | El reintento lo hace el outbox con `despacharPendientes`; envolver canales sería un segundo mecanismo. |
| **Chain of Responsibility** para filtros (preferencias, horario silencioso) | Con un solo canal es un `if`. Tiene sentido cuando haya preferencias por usuario y varios canales. |
| SDK del proveedor (por ejemplo, el de Brevo) en lugar de SMTP | Ata el código a un proveedor. Con SMTP se cambia de Brevo a Gmail o a Mailpit solo con variables de entorno. |
| Plantillas con un motor de templates (Handlebars, MJML) | Un solo email hoy; el Template Method en TypeScript es tipado y testeable. Se reconsidera si los emails se multiplican o los edita alguien que no programa. |

## Consecuencias

**A favor**

- Un aviso nuevo es una plantilla más una llamada a `notificar`.
- Push o bandeja interna: implementar `Canal`, registrarlo y que las
  plantillas devuelvan contenido para ese canal. Quien notifica no cambia.
- Trazabilidad completa (qué, a quién, cuándo, con qué resultado) y
  reintentos sin perder avisos.
- Testeable por partes: facade con canales simulados, plantillas puras, y un
  test de integración contra un servidor SMTP en memoria
  (`alertas.smtp.spec.ts`, helper en `test/utils/servidor-smtp.ts`).

**En contra / a vigilar**

- La tabla `notificaciones` crece con el tiempo. Con el volumen del club no es
  un problema; si lo fuera, una tarea de limpieza de lo ENVIADO con más de N
  meses.
- Los reintentos dependen de que algo llame a `despacharPendientes`: lo hace
  la tarea automática `reintentar-notificaciones` cada 6 horas
  ([decisión 0002](0002-servicio-de-tareas-automaticas.md)).
- Hoy todos los delegados reciben todas las alertas (DT-42).

**Para sumar push** (guía corta)

1. Agregar `PUSH` al enum `CanalNotificacion` (con su migración).
2. Tabla de suscripciones por usuario (Web Push con claves VAPID, gratis, o
   FCM).
3. `CanalPush implements Canal`: `destinoDe` devuelve la suscripción y
   `enviar` usa la librería `web-push`.
4. Registrarlo en el token `CANALES`.
5. En las plantillas que deban llegar por push, devolver `{ titulo, cuerpo, url }`
   cuando `canal === 'PUSH'`.
