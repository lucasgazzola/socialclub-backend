# Evidencia · US-26 — Alertas por vencimiento de documentación

> **Desde TASK-35 (DT-36)** los avisos salen por el servicio centralizado de
> notificaciones: cada delegado recibe **su propio email** (ya no van todos en
> copia oculta) y el registro de lo avisado está en la tabla `notificaciones`.
> **Desde TASK-36 (DT-22)** el envío es la tarea automática
> `vencimientos-documentacion`: se dispara con
> `POST /api/v1/tareas/vencimientos-documentacion/programada` (cabecera
> `x-tareas-token`) o desde *Administración → Tareas automáticas*.
> Las capturas de abajo son de la corrida original de US-26.

Corrida del 03/10/2026 contra la API y el frontend locales (rama
`feature/US-26-Alertas-vencimiento-documentacion`), con la base local cargada
por el seed y **Mailpit** como servidor de correo (atrapa los emails y los
muestra en el navegador; no los entrega a nadie).

| Archivo | Qué muestra | Casos |
|---|---|---|
| `01-inicio-delegado.png` | Inicio del delegado al iniciar sesión: alertas con participante, disciplina, documento, fecha y estado | TC-160, TC-162 |
| `02-inicio-admin.png` | Inicio del administrador con las alertas sobre los módulos | TC-171 |
| `03-email-bandeja.png` | El email llegó a la bandeja (Mailpit) | TC-165 |
| `04-email-abierto.png` | El email abierto: remitente, delegado en CCO, asunto y tabla de alertas | TC-165 |
| `05-alerta-ver-documentacion.png` | "Ver documentación" desde una alerta abre la documentación del participante | TC-164 |
| `notificar-api.txt` | Respuestas reales del endpoint: envío, segunda corrida sin repetir y token incorrecto (401) | TC-165, TC-166, TC-167 |

Tests automatizados que respaldan lo anterior (backend):

- `src/alertas/alertas.smtp.spec.ts` — **integración**: levanta un servidor SMTP
  en memoria y verifica lo que recibe (un email por delegado, asunto, HTML con
  cada alerta y el enlace); sin SMTP las notificaciones quedan pendientes y si
  el SMTP falla quedan FALLIDAS para reintentarse.
- `alertas-documentacion.spec.ts`, `alertas.service.spec.ts`,
  `alertas.access.spec.ts`, `alertas-documentacion.plantilla.spec.ts` y los de
  `src/notificaciones/`.

Frontend: `AlertasDocumentacion.test.tsx` y `DashboardPage.test.tsx`.

---

## Cómo reproducirlo

### 1. En local, sin enviar nada de verdad (Mailpit)

```bash
docker run -d --rm --name sc-mailpit -p 1025:1025 -p 8025:8025 axllent/mailpit
```

En el `.env` del backend:

```
SMTP_HOST=localhost
SMTP_PORT=1025
MAIL_FROM=avisos@socialclub.local
APP_URL=http://localhost:5173
TAREAS_TOKEN=token-local-de-prueba-123
```

Levantar la API (`npm run dev`), correr el seed (crea el delegado
`delegado@socialclub.local`) y disparar el aviso:

```bash
curl -X POST -H "x-tareas-token: token-local-de-prueba-123" \
  http://localhost:3000/api/v1/tareas/vencimientos-documentacion/programada
```

El email aparece en <http://localhost:8025>. Para volver a enviar lo mismo,
borrar sus notificaciones: `delete from notificaciones where tipo = 'ALERTAS_DOCUMENTACION';`.

### 2. A una casilla real, desde local

Mismo paso anterior pero con un SMTP de verdad. Dos opciones gratuitas:

- **Gmail** (lo más rápido para probar): activar la verificación en dos pasos
  en la cuenta → *Cuenta de Google → Seguridad → Contraseñas de aplicaciones* →
  generar una. Después:
  ```
  SMTP_HOST=smtp.gmail.com
  SMTP_PORT=465
  SMTP_USER=tu.cuenta@gmail.com
  SMTP_PASS=<contraseña de aplicación de 16 letras>
  MAIL_FROM=tu.cuenta@gmail.com
  ```
- **Brevo** (lo recomendado para test/main, 300 emails/día): crear cuenta →
  *Senders* → verificar el email remitente → *SMTP & API → SMTP* → generar clave.
  ```
  SMTP_HOST=smtp-relay.brevo.com
  SMTP_PORT=587
  SMTP_USER=<login SMTP que muestra Brevo>
  SMTP_PASS=<clave SMTP>
  MAIL_FROM=<remitente verificado>
  ```

Para recibirlo en tu casilla, el usuario delegado tiene que tener **tu email**:
crear un usuario con rol `DELEGADO` y tu dirección desde *Usuarios*, y llamar
al endpoint como en el paso 1. Si no llega, mirar *Spam* y el log de la API.

### 3. En el entorno de pruebas (test)

Seguir `DESPLIEGUE.md` §5.2.1 (secrets del environment `test` y de
repositorio), redesplegar y ejecutar *Actions → Tareas automáticas →
Run workflow* (tarea `vencimientos-documentacion`). El log del job muestra la
ejecución registrada; el delegado del entorno recibe el email.

## DT-42 · Cada delegado, solo sus disciplinas (04/10/2026)

Corrida contra la API y el frontend locales (ramas
`issue/TASK-39-DT-42-Delegado-por-disciplina`), con una base nueva con todas
las migraciones y el seed (el delegado de prueba queda a cargo de Fútbol Mayor,
Fútbol Femenino y Natación).

| Archivo | Qué muestra | Casos |
|---|---|---|
| `06-dt42-usuarios-disciplinas-a-cargo.png` | Grilla de Usuarios: el delegado con sus disciplinas a cargo bajo el rol | TC-176 |
| `07-dt42-editar-delegado.png` | Modal «Editar usuario»: rol DELEGADO y «Disciplinas a cargo» | TC-176 |
| `dt42-api.txt` | Respuestas reales: alertas que ve el delegado según sus disciplinas y los rechazos 400/404 | TC-173, TC-174, TC-177 |

Tests: `src/alertas/alertas.service.spec.ts` y `src/usuarios/usuarios.service.spec.ts`
(bloques «DT-42») en el backend; `UsuarioForm.spec.tsx` y `UsuariosPage.spec.tsx`
en el frontend.
