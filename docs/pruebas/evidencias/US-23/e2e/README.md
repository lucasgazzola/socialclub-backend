# Evidencia E2E · US-23

Capturas generadas por las pruebas E2E con Playwright (TASK-43) contra el sistema
real: front, API y Postgres levantados con migraciones y seed. Una captura al
final de cada paso del caso. El video y el trace de cada corrida quedan en el
reporte HTML (artifact `playwright-report` del CI).

> Generado por `socialclub-frontend/scripts/evidencia-e2e.mjs`: no editar a mano.

### TC-201 · Mostrar por moroso nombre completo, DNI, disciplina, períodos adeudados y monto total

Aprobado el 10/10/2026 · `e2e/morosos-cuota-deportiva.spec.ts`

  - [`TC-201-01.jpg`](TC-201-01.jpg) — 1. Como colaborador, abrir «Morosos cuota deportiva»
  - [`TC-201-02.jpg`](TC-201-02.jpg) — 2. Ubicar al moroso: nombre, DNI, deuda por disciplina, períodos y total

### TC-208 · Identificar por separado la deuda de cada disciplina

Aprobado el 10/10/2026 · `e2e/morosos-cuota-deportiva.spec.ts`

  - [`TC-208-01.jpg`](TC-208-01.jpg) — 1. Como colaborador, abrir el detalle del moroso
  - [`TC-208-02.jpg`](TC-208-02.jpg) — 2. Cada disciplina lista sus cuotas vencidas con vencimiento, importe y estado

### TC-210 · Restringir el listado a los roles que gestionan la cobranza

Aprobado el 10/10/2026 · `e2e/morosos-cuota-deportiva.spec.ts`

  - [`TC-210-01.jpg`](TC-210-01.jpg) — 1. Como delegado, abrir el listado por URL
  - [`TC-210-02.jpg`](TC-210-02.jpg) — 2. La API también lo rechaza (403)

### TC-211 · Abrir el cobro de la cuota deportiva desde un moroso

Aprobado el 10/10/2026 · `e2e/morosos-cuota-deportiva.spec.ts`

  - [`TC-211-01.jpg`](TC-211-01.jpg) — 1. Como colaborador, elegir «Cobrar» en la fila del moroso
  - [`TC-211-02.jpg`](TC-211-02.jpg) — 2. Se abre el cobro con el DNI cargado y las cuotas del moroso
