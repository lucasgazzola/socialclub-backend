# Evidencia E2E · US-35

Capturas generadas por las pruebas E2E con Playwright (TASK-43) contra el sistema
real: front, API y Postgres levantados con migraciones y seed. Una captura al
final de cada paso del caso. El video y el trace de cada corrida quedan en el
reporte HTML (artifact `playwright-report` del CI).

> Generado por `socialclub-frontend/scripts/evidencia-e2e.mjs`: no editar a mano.

### TC-212 · Mostrar total recaudado, total adeudado, cantidad de morosos y porcentaje de cobranza del período

Aprobado el 10/10/2026 · `e2e/estado-financiero.spec.ts`

  - [`TC-212-01.jpg`](TC-212-01.jpg) — 1. Como colaborador, abrir «Estado financiero» y elegir el 3.º trimestre
  - [`TC-212-02.jpg`](TC-212-02.jpg) — 2. El reporte muestra los cuatro indicadores

### TC-215 · Seleccionar el período por mes, trimestre o rango personalizado

Aprobado el 10/10/2026 · `e2e/estado-financiero.spec.ts`

  - [`TC-215-01.jpg`](TC-215-01.jpg) — 1. Elegir un mes
  - [`TC-215-02.jpg`](TC-215-02.jpg) — 2. Elegir un rango personalizado

### TC-217 · Filtrar el reporte por disciplina

Aprobado el 10/10/2026 · `e2e/estado-financiero.spec.ts`

  - [`TC-217-01.jpg`](TC-217-01.jpg) — 1. Elegir «Natación» en el filtro de disciplina
  - [`TC-217-02.jpg`](TC-217-02.jpg) — 2. El reporte muestra solo la cuota deportiva de Natación

### TC-219 · Coincidir la deuda del reporte con los listados de morosos

Aprobado el 10/10/2026 · `e2e/estado-financiero.spec.ts`

  - [`TC-219-01.jpg`](TC-219-01.jpg) — 1. Generar el reporte de enero al mes actual
  - [`TC-219-02.jpg`](TC-219-02.jpg) — 2. El listado de morosos de cuota deportiva suma la misma deuda vencida

### TC-220 · Restringir el reporte a los roles que gestionan la cobranza

Aprobado el 10/10/2026 · `e2e/estado-financiero.spec.ts`

  - [`TC-220-01.jpg`](TC-220-01.jpg) — 1. Como delegado, abrir el reporte por URL
  - [`TC-220-02.jpg`](TC-220-02.jpg) — 2. La API también lo rechaza (403)
