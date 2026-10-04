# Evidencia E2E · US-21

Capturas generadas por las pruebas E2E con Playwright (TASK-43) contra el sistema
real: front, API y Postgres levantados con migraciones y seed. Una captura al
final de cada paso del caso. El video y el trace de cada corrida quedan en el
reporte HTML (artifact `playwright-report` del CI).

> Generado por `socialclub-frontend/scripts/evidencia-e2e.mjs`: no editar a mano.

### TC-110 · Cambiar el estado del integrante a «al día» al saldar todos los períodos

Aprobado el 04/10/2026 · `e2e/cuotas.spec.ts`

  - [`TC-110-01.jpg`](TC-110-01.jpg) — 1. Como colaborador, buscar al participante y marcar el período adeudado
  - [`TC-110-02.jpg`](TC-110-02.jpg) — 2. Registrar el cobro: el participante queda «Al día»

### TC-116 · Impedir el acceso al cobro sin rol autorizado

Aprobado el 04/10/2026 · `e2e/cuotas.spec.ts`

  - [`TC-116-01.jpg`](TC-116-01.jpg) — 1. Como delegado, abrir «Cobrar cuota deportiva» por URL
  - [`TC-116-02.jpg`](TC-116-02.jpg) — 2. La API también lo rechaza (403)

### TC-117 · Visualizar las cuotas deportivas pendientes por disciplina

Aprobado el 04/10/2026 · `e2e/cuotas.spec.ts`

  - [`TC-117-01.jpg`](TC-117-01.jpg) — 1. Como colaborador, abrir «Cobrar cuota deportiva»
  - [`TC-117-02.jpg`](TC-117-02.jpg) — 2. Buscar al participante por DNI: muestra Natación con el mes en curso
