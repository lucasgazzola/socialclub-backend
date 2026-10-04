# Evidencia E2E · US-16

Capturas generadas por las pruebas E2E con Playwright (TASK-43) contra el sistema
real: front, API y Postgres levantados con migraciones y seed. Una captura al
final de cada paso del caso. El video y el trace de cada corrida quedan en el
reporte HTML (artifact `playwright-report` del CI).

> Generado por `socialclub-frontend/scripts/evidencia-e2e.mjs`: no editar a mano.

### TC-091 · Configurar la cuota social de una categoría para el período siguiente

Aprobado el 04/10/2026 · `e2e/cuotas.spec.ts`

  - [`TC-091-01.jpg`](TC-091-01.jpg) — 1. Como administrador, abrir Cuota social y «Configurar cuota social»
  - [`TC-091-02.jpg`](TC-091-02.jpg) — 2. Elegir la categoría y el monto, sin período (rige desde el siguiente)
  - [`TC-091-03.jpg`](TC-091-03.jpg) — 3. Guardar: la configuración figura en el listado
