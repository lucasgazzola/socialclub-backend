# Evidencia E2E · US-14

Capturas generadas por las pruebas E2E con Playwright (TASK-43) contra el sistema
real: front, API y Postgres levantados con migraciones y seed. Una captura al
final de cada paso del caso. El video y el trace de cada corrida quedan en el
reporte HTML (artifact `playwright-report` del CI).

> Generado por `socialclub-frontend/scripts/evidencia-e2e.mjs`: no editar a mano.

### TC-039 · Validar la baja lógica de un socio

Aprobado el 10/10/2026 · `e2e/socios.spec.ts`

  - [`TC-039-01.jpg`](TC-039-01.jpg) — 1. Como administrador, buscar al socio en Socios
  - [`TC-039-02.jpg`](TC-039-02.jpg) — 2. Elegir «Dar de baja» y confirmar
  - [`TC-039-03.jpg`](TC-039-03.jpg) — 3. El socio queda inactivo

### TC-043 · Validar que un socio dado de baja no aparezca en el listado activo

Aprobado el 10/10/2026 · `e2e/socios.spec.ts`

  - [`TC-043-01.jpg`](TC-043-01.jpg) — 1. Como administrador, filtrar Socios por «Activos»
  - [`TC-043-02.jpg`](TC-043-02.jpg) — 2. En «Inactivos» sí aparece
