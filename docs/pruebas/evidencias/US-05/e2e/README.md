# Evidencia E2E · US-05

Capturas generadas por las pruebas E2E con Playwright (TASK-43) contra el sistema
real: front, API y Postgres levantados con migraciones y seed. Una captura al
final de cada paso del caso. El video y el trace de cada corrida quedan en el
reporte HTML (artifact `playwright-report` del CI).

> Generado por `socialclub-frontend/scripts/evidencia-e2e.mjs`: no editar a mano.

### TC-017 · Registrar correctamente un participante en una disciplina activa

Aprobado el 04/10/2026 · `e2e/inscripcion-y-alertas.spec.ts`

  - [`TC-017-01.jpg`](TC-017-01.jpg) — 1. Iniciar sesión como delegado
  - [`TC-017-02.jpg`](TC-017-02.jpg) — 2. Abrir Participantes y elegir «Nuevo participante»
  - [`TC-017-03.jpg`](TC-017-03.jpg) — 3. Completar los datos de un participante con DNI nuevo
  - [`TC-017-04.jpg`](TC-017-04.jpg) — 4. Elegir Natación · Adultos / Libre y revisar la documentación exigida
  - [`TC-017-05.jpg`](TC-017-05.jpg) — 5. Registrar al participante sin adjuntar la documentación
