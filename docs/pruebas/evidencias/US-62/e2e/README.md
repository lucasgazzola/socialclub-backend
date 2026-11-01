# Evidencia E2E · US-62

Capturas generadas por las pruebas E2E con Playwright (TASK-43) contra el sistema
real: front, API y Postgres levantados con migraciones y seed. Una captura al
final de cada paso del caso. El video y el trace de cada corrida quedan en el
reporte HTML (artifact `playwright-report` del CI).

> Generado por `socialclub-frontend/scripts/evidencia-e2e.mjs`: no editar a mano.

### TC-286 · Consultar «Mis Reservas» con el estado y el detalle de cada solicitud

Aprobado el 01/11/2026 · `e2e/reservas.spec.ts`

  - [`TC-286-01.jpg`](TC-286-01.jpg) — 1. Como socia, abrir «Mis reservas» desde el menú
  - [`TC-286-02.jpg`](TC-286-02.jpg) — 2. Cada reserva muestra código, espacio, turno, monto y estado; la rechazada, su motivo

### TC-287 · Destacar el límite y las instrucciones para pagar la seña

Aprobado el 01/11/2026 · `e2e/reservas.spec.ts`

  - [`TC-287-01.jpg`](TC-287-01.jpg) — 1. En «Mis reservas», la reserva aprobada destaca el límite y cómo pagar la seña
