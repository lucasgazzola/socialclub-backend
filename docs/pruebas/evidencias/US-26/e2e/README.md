# Evidencia E2E · US-26

Capturas generadas por las pruebas E2E con Playwright (TASK-43) contra el sistema
real: front, API y Postgres levantados con migraciones y seed. Una captura al
final de cada paso del caso. El video y el trace de cada corrida quedan en el
reporte HTML (artifact `playwright-report` del CI).

> Generado por `socialclub-frontend/scripts/evidencia-e2e.mjs`: no editar a mano.

### TC-162 · Alertar un documento faltante cuyo plazo de presentación termina en los próximos 10 días

Aprobado el 04/10/2026 · `e2e/inscripcion-y-alertas.spec.ts`

  - [`TC-162-01.jpg`](TC-162-01.jpg) — 1. Iniciar sesión como delegado
  - [`TC-162-02.jpg`](TC-162-02.jpg) — 2. Mirar las alertas del Inicio

### TC-173 · DT-42: el delegado ve solo las alertas de las disciplinas que tiene a cargo

Aprobado el 04/10/2026 · `e2e/inscripcion-y-alertas.spec.ts`

  - [`TC-173-01.jpg`](TC-173-01.jpg) — 1. El delegado de Básquet no ve la alerta de Natación
  - [`TC-173-02.jpg`](TC-173-02.jpg) — 2. El delegado de Natación sí la ve

### TC-176 · DT-42: asignar disciplinas a cargo a un delegado desde Usuarios

Aprobado el 04/10/2026 · `e2e/inscripcion-y-alertas.spec.ts`

  - [`TC-176-01.jpg`](TC-176-01.jpg) — 1. Iniciar sesión como administrador y abrir Usuarios
  - [`TC-176-02.jpg`](TC-176-02.jpg) — 2. Cargar un delegado nuevo sin disciplinas: el formulario las exige
  - [`TC-176-03.jpg`](TC-176-03.jpg) — 3. Marcar Básquet en «Disciplinas a cargo» y guardar
  - [`TC-176-04.jpg`](TC-176-04.jpg) — 4. La grilla muestra la disciplina debajo del rol
