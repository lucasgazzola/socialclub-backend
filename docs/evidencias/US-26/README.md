# Evidencia · US-26 — Alertas por vencimiento de documentación

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
  en memoria y verifica lo que recibe (destinatarios en CCO, asunto, HTML con
  cada alerta y el enlace), que sin SMTP no se conecta y que si el SMTP falla
  las alertas no quedan marcadas.
- `alertas-documentacion.spec.ts`, `alertas.service.spec.ts`,
  `alertas.access.spec.ts`, `email-alertas.spec.ts`, `notificaciones/mail.service.spec.ts`.

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
ALERTAS_CRON_TOKEN=token-local-de-prueba-123
```

Levantar la API (`npm run dev`), correr el seed (crea el delegado
`delegado@socialclub.local`) y disparar el aviso:

```bash
curl -X POST -H "x-cron-token: token-local-de-prueba-123" \
  http://localhost:3000/api/v1/alertas/documentacion/notificar
```

El email aparece en <http://localhost:8025>. Para volver a enviar lo mismo,
vaciar la tabla de avisos: `delete from alertas_documentacion_notificadas;`.

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
repositorio), redesplegar y ejecutar *Actions → Alertas de documentación →
Run workflow*. El log del job muestra la respuesta del endpoint; el delegado
del entorno recibe el email.
