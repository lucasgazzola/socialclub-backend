# Evidencia E2E · US-39

Capturas generadas por las pruebas E2E con Playwright (TASK-43) contra el sistema
real: front, API y Postgres levantados con migraciones y seed. Una captura al
final de cada paso del caso. El video y el trace de cada corrida quedan en el
reporte HTML (artifact `playwright-report` del CI).

> Generado por `socialclub-frontend/scripts/evidencia-e2e.mjs`: no editar a mano.

### TC-085 · Iniciar sesión con credenciales válidas

Aprobado el 04/10/2026 · `e2e/sesion-y-usuarios.spec.ts`

  - [`TC-085-01.jpg`](TC-085-01.jpg) — 1. Abrir la pantalla de inicio de sesión
  - [`TC-085-02.jpg`](TC-085-02.jpg) — 2. Ingresar email y contraseña válidos

### TC-086 · Rechazar inicio de sesión con credenciales inválidas

Aprobado el 04/10/2026 · `e2e/sesion-y-usuarios.spec.ts`

  - [`TC-086-01.jpg`](TC-086-01.jpg) — 1. Ingresar una contraseña incorrecta
