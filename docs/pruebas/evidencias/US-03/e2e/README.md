# Evidencia E2E · US-03

Capturas generadas por las pruebas E2E con Playwright (TASK-43) contra el sistema
real: front, API y Postgres levantados con migraciones y seed. Una captura al
final de cada paso del caso. El video y el trace de cada corrida quedan en el
reporte HTML (artifact `playwright-report` del CI).

> Generado por `socialclub-frontend/scripts/evidencia-e2e.mjs`: no editar a mano.

### TC-013 · Dar de baja correctamente a un integrante

Aprobado el 04/10/2026 · `e2e/sesion-y-usuarios.spec.ts`

  - [`TC-013-01.jpg`](TC-013-01.jpg) — 1. Como administrador, buscar al usuario en Usuarios
  - [`TC-013-02.jpg`](TC-013-02.jpg) — 2. Elegir «Desactivar» y confirmar
  - [`TC-013-03.jpg`](TC-013-03.jpg) — 3. El usuario queda inactivo

### TC-014 · Verificar que un integrante dado de baja no pueda iniciar sesión

Aprobado el 04/10/2026 · `e2e/sesion-y-usuarios.spec.ts`

  - [`TC-014-01.jpg`](TC-014-01.jpg) — 1. Intentar iniciar sesión con el usuario dado de baja
