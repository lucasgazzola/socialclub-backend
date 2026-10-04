# Evidencia E2E · US-01

Capturas generadas por las pruebas E2E con Playwright (TASK-43) contra el sistema
real: front, API y Postgres levantados con migraciones y seed. Una captura al
final de cada paso del caso. El video y el trace de cada corrida quedan en el
reporte HTML (artifact `playwright-report` del CI).

> Generado por `socialclub-frontend/scripts/evidencia-e2e.mjs`: no editar a mano.

### TC-001 · Registrar un usuario válido

Aprobado el 04/10/2026 · `e2e/sesion-y-usuarios.spec.ts`

  - [`TC-001-01.jpg`](TC-001-01.jpg) — 1. Como administrador, abrir Usuarios y «Nuevo usuario»
  - [`TC-001-02.jpg`](TC-001-02.jpg) — 2. Completar los datos con el rol COLABORADOR
  - [`TC-001-03.jpg`](TC-001-03.jpg) — 3. Guardar: el usuario aparece activo en la grilla
