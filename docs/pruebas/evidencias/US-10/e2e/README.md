# Evidencia E2E · US-10

Capturas generadas por las pruebas E2E con Playwright (TASK-43) contra el sistema
real: front, API y Postgres levantados con migraciones y seed. Una captura al
final de cada paso del caso. El video y el trace de cada corrida quedan en el
reporte HTML (artifact `playwright-report` del CI).

> Generado por `socialclub-frontend/scripts/evidencia-e2e.mjs`: no editar a mano.

### TC-260 · Mantener la cuota pendiente cuando el pago es rechazado y permitir reintentar o cancelar

Aprobado el 31/10/2026 · `e2e/pasarela-de-pagos.spec.ts`

  - [`TC-260-01.jpg`](TC-260-01.jpg) — 1. Como socia, elegir la cuota pendiente más antigua y confirmar el pago
  - [`TC-260-02.jpg`](TC-260-02.jpg) — 2. La pasarela muestra el concepto y el total; rechazar el pago
  - [`TC-260-03.jpg`](TC-260-03.jpg) — 3. El resultado informa el rechazo y permite reintentar o cancelar
  - [`TC-260-04.jpg`](TC-260-04.jpg) — 4. Cancelar: no se cobró nada y la cuota sigue pendiente
