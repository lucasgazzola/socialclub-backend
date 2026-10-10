# Evidencia E2E · US-40

Capturas generadas por las pruebas E2E con Playwright (TASK-43) contra el sistema
real: front, API y Postgres levantados con migraciones y seed. Una captura al
final de cada paso del caso. El video y el trace de cada corrida quedan en el
reporte HTML (artifact `playwright-report` del CI).

> Generado por `socialclub-frontend/scripts/evidencia-e2e.mjs`: no editar a mano.

### TC-088 · Cerrar sesión correctamente

Aprobado el 10/10/2026 · `e2e/sesion-y-usuarios.spec.ts`

  - [`TC-088-01.jpg`](TC-088-01.jpg) — 1. Iniciar sesión como administrador
  - [`TC-088-02.jpg`](TC-088-02.jpg) — 2. Elegir «Cerrar sesión»: vuelve a la pantalla de ingreso

### TC-089 · Bloquear el acceso a secciones protegidas tras cerrar sesión

Aprobado el 10/10/2026 · `e2e/sesion-y-usuarios.spec.ts`

  - [`TC-089-01.jpg`](TC-089-01.jpg) — 1. Iniciar sesión y cerrarla
  - [`TC-089-02.jpg`](TC-089-02.jpg) — 2. Abrir Usuarios por URL: redirige al ingreso
