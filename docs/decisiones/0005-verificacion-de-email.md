# 0005 · Verificación de email con enlace de un solo uso

- **Estado:** Aceptada
- **Fecha:** 11/11/2026 · **TASK-59** · resuelve **DT-54** (devolución del profesor, 3ra reunión)
- **Código:** `src/verificacion-email/` · `prisma/schema.prisma` (`Usuario.passwordHash?`, `Usuario.emailVerificadoEn`, `TokenUsuario`) · `src/common/decorators/confirma-email.decorator.ts`

## Contexto

Hasta ahora, quien daba de alta un usuario (`POST /usuarios`) también le cargaba la contraseña. La persona recibía una clave que había elegido otro, y nadie confirmaba que el email fuera suyo. Además, el alta de un socio o de un participante solo creaba la `Persona`: no había cuenta ni aviso. El registro público (US-38) dejaba entrar sin comprobar el email.

El profesor pidió que:

- al dar de alta a alguien con email, le llegue un **enlace para verificarlo**, válido por **24 horas**;
- mientras no lo use, la cuenta quede **pendiente de verificación** y **no pueda iniciar sesión**, porque todavía no tiene contraseña;
- la contraseña la **elija la persona** desde ese enlace, y en ese momento su email quede verificado;
- al cargar el email, se **escriba dos veces** por si hay un error de tipeo.

## Decisión

### Modelo

| Cambio | Para qué |
|---|---|
| `usuarios.passwordHash` pasa a ser opcional | `null` mientras la persona no eligió su contraseña. Sin contraseña no se puede iniciar sesión. |
| `usuarios.emailVerificadoEn` | Cuándo usó el enlace. `null` = pendiente de verificación. La migración marca como verificadas las cuentas que ya existían. |
| Tabla `tokens_usuario` | Tokens de un solo uso: usuario, tipo (`VERIFICACION_EMAIL`), **hash SHA-256** del token, `expiraEn`, `usadoEn` y `anuladoEn`. |

El token se genera con `crypto.randomBytes(32)` y en la tabla solo se guarda su hash: con la base no se puede armar un enlace válido.

### Quién recibe el enlace

| Alta | Cuenta que se crea | Qué hace el enlace |
|---|---|---|
| Usuario administrativo (US-01) | Con sus roles, sin contraseña | Elegir contraseña + verificar email |
| Socio (US-12), si tiene email | Con rol `SOCIO`, sin contraseña. Si la persona ya tenía cuenta, solo se le suma el rol. | Elegir contraseña + verificar email |
| Participante nuevo (US-05), si tiene email | Sin roles, sin contraseña | Elegir contraseña + verificar email |
| Registro público (US-38) | La persona ya eligió su contraseña | Solo verificar email |

Sin email no se crea cuenta. Inscribir a un participante que ya existía no crea cuenta.

### Flujo

1. El alta crea la cuenta y emite el token **dentro de su transacción** (`VerificacionEmailService.emitir` / `crearCuentaPendiente`).
2. Cuando la transacción termina, `enviar` manda el enlace `APP_URL/verificar-email?token=…` con la plantilla `VerificacionEmailPlantilla` por `NotificacionesService` (decisión 0001). Si el envío falla, el alta no se deshace: el outbox lo reintenta y el administrador puede reenviarlo.
3. La pantalla pública del front consulta el enlace (`POST /auth/verificacion/consultar`) y, si la cuenta no tiene contraseña, la pide dos veces.
4. `POST /auth/verificacion` marca el token como usado con un `updateMany` condicionado (`usadoEn` nulo, no anulado, no vencido): si llegan dos pedidos a la vez, el segundo recibe 409. En la misma transacción guarda la contraseña, completa `emailVerificadoEn` y audita `VERIFICAR_EMAIL`.
5. El login rechaza a una cuenta sin contraseña o sin verificar con *«Tenés que verificar tu email antes de iniciar sesión. Revisá tu correo; si el enlace venció, pedile al club que te envíe uno nuevo.»*

### Vencimiento y reenvío

- El enlace dura **24 horas** (`VERIFICACION_EMAIL_HORAS_VALIDEZ`) y sirve **una sola vez**.
- Al emitir un enlace nuevo se **anulan los anteriores**: siempre sirve solo el último.
- **El reenvío lo hace solo el administrador** (decisión del equipo, 11/11/2026): `POST /usuarios/:id/reenviar-verificacion`, acción «Reenviar enlace» en la grilla de usuarios, donde también aparecen los socios y participantes pendientes. La persona no puede pedirlo por su cuenta: el login y la pantalla del enlace vencido le indican que se lo pida al club.
- Máximo **5 enlaces por cuenta cada 24 horas**.

### El token viaja en el body

Los endpoints públicos reciben el token en el body (`POST`), no en la URL de la API, para que no quede en los logs de acceso. En el front el token llega por la URL del email, que es inevitable.

### Email escrito dos veces

`confirmarEmail` es obligatorio en el alta de usuario y en el registro público, y en el alta de socio y de participante cuando se carga un email. El validador `@ConfirmaEmail` lo compara sin distinguir mayúsculas ni espacios en los extremos, igual que se guarda el email. En la edición, el front lo pide solo si el email cambia.

## Alternativas

- **Que el administrador siga cargando la contraseña y se verifique solo el email:** descartada. La persona usaría una clave que conoce otro, que es lo que el profesor marcó.
- **Reenvío por la propia persona (desde el login o desde el enlace vencido):** se implementó y se descartó a pedido del equipo, para que el club controle a quién le llegan enlaces.
- **Token firmado (JWT) sin tabla:** no se podría usar una sola vez ni anular al reenviar sin guardar estado igual.
- **Guardar el token en claro:** quien lea la base podría activar cuentas ajenas.
- **Armar el enlace recién al enviar, para no guardarlo en `notificaciones`:** obligaría a cambiar el outbox (decisión 0001), que guarda el email ya armado para reintentarlo. Se acepta que el enlace quede en `notificaciones.contenido`: vence en 24 h, sirve una vez y esa tabla solo la ve el administrador.
- **Bloquear el pegado en «Repetí el email»:** descartada por accesibilidad. Molesta a quien usa lectores de pantalla o gestores de contraseñas.

## Consecuencias

- Las cuentas creadas por el club ya no tienen una contraseña elegida por otro, y todo email que entra al sistema fue confirmado por su dueño.
- La tabla `tokens_usuario` sirve también para el **recupero de contraseña**: es sumar el tipo `RECUPERO` y otra plantilla.
- Si la persona **no recibe el email** (SMTP sin configurar o caído), queda pendiente hasta que se reenvíe. La grilla de usuarios lo muestra.
- **Pendiente ([DT-59](../DEUDA-TECNICA.md#dt-59--cambiar-el-email-no-vuelve-a-verificarlo)):** si el administrador o el socio cambian un email ya verificado, hoy no se vuelve a verificar.
- Los usuarios del seed nacen verificados para seguir entrando con `Admin123!`.
