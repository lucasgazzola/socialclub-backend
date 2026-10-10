# Evidencia E2E · US-30

Capturas generadas por las pruebas E2E con Playwright (TASK-43) contra el sistema
real: front, API y Postgres levantados con migraciones y seed. Una captura al
final de cada paso del caso. El video y el trace de cada corrida quedan en el
reporte HTML (artifact `playwright-report` del CI).

> Generado por `socialclub-frontend/scripts/evidencia-e2e.mjs`: no editar a mano.

### TC-069 · Verificar que la compra de varias entradas genera múltiples QRs individuales

Aprobado el 10/10/2026 · `e2e/eventos-y-entradas.spec.ts`

  - [`TC-069-01.jpg`](TC-069-01.jpg) — 1. Como socio, abrir el evento y elegir 2 entradas
  - [`TC-069-02.jpg`](TC-069-02.jpg) — 2. Pagar con la pasarela de prueba
  - [`TC-069-03.jpg`](TC-069-03.jpg) — 3. Confirmar: se generan dos entradas, cada una con su QR y su token
