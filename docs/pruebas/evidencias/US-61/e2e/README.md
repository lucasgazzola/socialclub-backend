# Evidencia E2E · US-61

Capturas generadas por las pruebas E2E con Playwright (TASK-43) contra el sistema
real: front, API y Postgres levantados con migraciones y seed. Una captura al
final de cada paso del caso. El video y el trace de cada corrida quedan en el
reporte HTML (artifact `playwright-report` del CI).

> Generado por `socialclub-frontend/scripts/evidencia-e2e.mjs`: no editar a mano.

### TC-281 · Cancelar por falta de pago una reserva con la seña vencida

Aprobado el 01/11/2026 · `e2e/reservas.spec.ts`

  - [`TC-281-01.jpg`](TC-281-01.jpg) — 1. En «Pendientes de pago», RES-SEED06 muestra la seña vencida
  - [`TC-281-02.jpg`](TC-281-02.jpg) — 2. Cancelar por falta de pago y confirmar: el turno queda libre

### TC-284 · El solicitante cancela su reserva antes del plazo de penalización

Aprobado el 01/11/2026 · `e2e/reservas.spec.ts`

  - [`TC-284-01.jpg`](TC-284-01.jpg) — 1. En «Mis reservas», elegir «Cancelar» en RES-SEED04
  - [`TC-284-02.jpg`](TC-284-02.jpg) — 2. La reserva queda cancelada por el usuario y el turno libre
