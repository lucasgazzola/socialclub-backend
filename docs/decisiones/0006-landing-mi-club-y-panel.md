# 0006 · Landing pública, portal «Mi club» y panel de gestión separados

- **Estado:** Aceptada
- **Fecha:** 15/11/2026 · **TASK-60** · resuelve DT-57 · toca US-09, US-31 y US-52
- **Código:** front `src/routes/paths.ts`, `src/routes/AppRouter.tsx`, `src/components/layout/PortalLayout.tsx`, `src/features/landing/`, `src/features/mi-club/`, `src/features/socios/pages/AsociarmePage.tsx` · back `src/club/`, `src/entradas/entradas.service.ts`

## Contexto

Hasta TASK-60 todos los usuarios entraban al mismo panel lateral: el administrador, el colaborador, el delegado, el socio y el participante. Al socio y al participante el panel les mostraba solo algunos ítems, pero seguía siendo una herramienta de gestión: tenía la estética del back office, no servía en el celular y no había una puerta de entrada al club para quien todavía no tenía cuenta.

El equipo pidió:

- Una **landing** que presente al club (Club Sportivo Unión de Ordóñez), con una estética inspirada en global.fan pero sin perder la línea de SocialClub.
- Que una persona pueda **hacerse socia desde ahí y pagar con Mercado Pago**.
- Un **portal de autogestión** para socios y participantes, con todo lo que hoy pueden hacer, dividido por responsabilidad.
- **Entradas** con el estado visible: las usadas y las vencidas, bien diferenciadas de las que todavía sirven.
- El panel de gestión, aparte.

## Decisión

### Tres zonas, una sola SPA

| Zona | Ruta | Quién | Layout |
|---|---|---|---|
| Sitio público | `/`, `/asociarme`, `/login`, `/register`, `/verificar-email` | Cualquiera | `SitioHeader` / `MarcoAcceso` |
| Mi club | `/mi-club/*`, `/pagos/resultado`, `/pagos/simulador` | Cualquier usuario con sesión | `PortalLayout` |
| Panel | `/admin/*` | ADMIN, COLABORADOR, DELEGADO | `AppLayout` (el panel de siempre) |

- **Path y no subdominio.** El panel vive en `/admin` dentro del mismo deploy. No hay que tocar la cookie de sesión, el CORS ni Vercel, y en local funciona sin configurar nada. Si más adelante se quiere `admin.dominio`, alcanza con elegir el árbol de rutas según `window.location.hostname`.
- **Lo personal vive en Mi club, también para la gestión.** Perfil, cuotas, entradas, reservas e inscripciones propias salen del menú del panel. Quien tiene un rol de gestión entra al panel, que suma un acceso «Mi club» arriba a la derecha; desde Mi club vuelve con «Ir al panel de gestión» en el menú de la cuenta.
- **Redirección al ingresar:** primero, la ruta que se pidió antes del login (`state.from`, solo rutas internas). Si no hay, la que dejó pendiente el alta de socio (`volverA`, en `localStorage`, porque la verificación del email se abre en otra pestaña). Si tampoco hay, el panel para la gestión y Mi club para el resto.
- **Rutas viejas:** `/socios`, `/mis-entradas`, etc. redirigen a su lugar nuevo (`rutaNuevaDe`) y conservan la query.
- **Rutas que arma la API:** `/verificar-email` y `/pagos/resultado` no se movieron, porque van en los emails y en las URL de vuelta de Mercado Pago.

### Mi club: una sección por responsabilidad

| Sección | Contenido | Reutiliza |
|---|---|---|
| Inicio | Saludo, credencial de socio, «Para hacer» (cuotas, seña de reserva, solicitudes), próxima entrada y accesos rápidos | Hooks de pagos, entradas, reservas e inscripción |
| Entradas | Próximas / Historial, agrupadas por evento, QR en pantalla completa | `useMisEntradas` |
| Cuotas | Estado, pago online e historial (o «Asociate» si nunca fue socio) | `MisCuotasPage` |
| Disciplinas | Inscripciones (catálogo y mis solicitudes) y documentación | `SolicitarInscripcionPage`, `MiDocumentacionPage` |
| Reservas | Mis reservas, seña y nueva solicitud | `MisReservasPage`, `SolicitarReservaPage` |
| Perfil | Datos, contraseña, baja o reactivación | `PerfilSocioPage` |

En el celular la navegación es una barra inferior fija (patrón de app); en escritorio, la misma barra arriba. Los estados se comunican con ícono, color y texto juntos, nunca solo con color.

### Alta de socio con pago

`/asociarme`: plan → cuenta (crear o ingresar) → datos → primera cuota. La membresía queda **activa al confirmar los datos**, como en US-09, y enseguida se ofrece pagar la primera cuota social con la pasarela (ADR 0003). La persona puede dejarla para después; en ese caso queda como cualquier socio con una cuota pendiente. El ex socio reactiva (US-43) en lugar de cargar todo de nuevo.

### Información pública del club

`GET /club/publico`, sin sesión: planes de socio con su cuota vigente (`CuotaSocialService.getVigentes`), disciplinas activas y números reales (socios con membresía activa, participantes con inscripción activa, disciplinas y eventos publicados por venir). No expone datos personales. La identidad institucional (nombre, misión, visión, valores y contacto) está en `src/config/club.ts` del front; el contacto está marcado como **datos de ejemplo**.

### Vigencia de las entradas calculada por fecha

- `GET /entradas/mis-entradas` devuelve como `EXPIRADA` toda entrada `VALIDA` de un evento que ya terminó o se canceló, sin esperar a la tarea `cierre-de-eventos` (que además depende de GitHub Actions). Los filtros por `estado` usan la misma regla.
- `vigencia=PROXIMAS` devuelve las válidas de eventos por venir, ordenadas por fecha del evento; `vigencia=HISTORIAL`, todo lo demás, del evento más reciente al más viejo.
- `Entrada.usadaEn` (migración `20261115120000_entrada_usada_en`) guarda cuándo se validó en la puerta, para mostrar «Usada el …».
- La entrada de un evento **cancelado** ya no da acceso al validarla, y su estado no se modifica.

## Alternativas

- **Subdominio `admin.` ya.** Se descartó para la entrega: exige dominio propio en Vercel y otro origen en el CORS, y no le suma nada a la demo. Sigue siendo posible.
- **Membresía pendiente hasta que se acredite el pago.** Respeta más estrictamente la idea de «no hay socio sin pago», pero cambia US-09 (ya aceptada): un estado nuevo, un `@Acreditador()` que active la membresía y una tarea que venza las altas impagas. Queda como mejora.
- **Marcar `EXPIRADA` en la base al listar.** Escribir en un GET mezcla lectura con escritura y suma carreras. Calcularlo en la respuesta alcanza; la tarea de cierre sigue siendo la que persiste el estado.
- **Agrupar las entradas por evento en el back.** La paginación pasaría a ser por evento y cambiaría el contrato de US-52. Se agrupa en el front dentro de cada página; «Próximas» trae hasta 50 entradas para que la agrupación sea fiel en el uso real.

## Consecuencias

- El socio y el participante tienen una experiencia propia, pensada para el celular, y la landing presenta al club con datos reales.
- El panel queda solo para la gestión, y su menú es más corto.
- Los E2E y los tests unitarios se actualizaron a las rutas nuevas.
- **Pendiente:** el participante sin membresía tiene una cuenta **sin rol**, y `GET /documentacion/mi-documentacion` (y su `/estado`) exigen al menos `SOCIO`: en Mi club, ese participante no puede ver su propia documentación. Ver DT-58.
- **Pendiente:** si un usuario tiene muchas entradas de un mismo evento, la tarjeta muestra las de la página actual (hasta 50).
