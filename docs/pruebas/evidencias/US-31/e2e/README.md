# Evidencia E2E · US-31

Capturas generadas por las pruebas E2E con Playwright (TASK-43) contra el sistema
real: front, API y Postgres levantados con migraciones y seed. Una captura al
final de cada paso del caso. El video y el trace de cada corrida quedan en el
reporte HTML (artifact `playwright-report` del CI).

> Generado por `socialclub-frontend/scripts/evidencia-e2e.mjs`: no editar a mano.

### TC-198 · Validar el acceso con una entrada válida

Aprobado el 10/10/2026 · `e2e/eventos-y-entradas.spec.ts`

  - [`TC-198-01.jpg`](TC-198-01.jpg) — 1. Como colaborador, abrir Validar QR y elegir el evento
  - [`TC-198-02.jpg`](TC-198-02.jpg) — 2. Ingresar el token de la entrada manualmente
  - [`TC-198-03.jpg`](TC-198-03.jpg) — 3. El sistema permite el acceso

### TC-199 · Rechazar una entrada ya utilizada

Aprobado el 10/10/2026 · `e2e/eventos-y-entradas.spec.ts`

  - [`TC-199-01.jpg`](TC-199-01.jpg) — 1. Como colaborador, volver a validar la misma entrada
  - [`TC-199-02.jpg`](TC-199-02.jpg) — 2. El sistema rechaza el reingreso
