# Evidencia E2E · US-29

Capturas generadas por las pruebas E2E con Playwright (TASK-43) contra el sistema
real: front, API y Postgres levantados con migraciones y seed. Una captura al
final de cada paso del caso. El video y el trace de cada corrida quedan en el
reporte HTML (artifact `playwright-report` del CI).

> Generado por `socialclub-frontend/scripts/evidencia-e2e.mjs`: no editar a mano.

### TC-059 · Validar la creación de un evento con datos válidos

Aprobado el 04/10/2026 · `e2e/eventos-y-entradas.spec.ts`

  - [`TC-059-01.jpg`](TC-059-01.jpg) — 1. Como administrador, abrir Eventos y «Nuevo evento»
  - [`TC-059-02.jpg`](TC-059-02.jpg) — 2. Completar nombre, lugar, cupo, precio y fecha (dentro de 7 días)
  - [`TC-059-03.jpg`](TC-059-03.jpg) — 3. Crear el evento: aparece publicado en el listado
