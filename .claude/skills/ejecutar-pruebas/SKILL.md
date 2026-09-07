---
name: ejecutar-pruebas
description: >-
  Ejecuta la suite de tests (Jest en backend, Vitest en frontend) y exporta la
  evidencia en el formato "Registro de Ejecución" (EJ) del equipo, en CSV listo
  para Excel. Usalo para el testeo real y para generar la evidencia entregable.
---

# Skill: ejecutar-pruebas (Equipo Nullpointer)

Objetivo: correr los tests **de verdad** y que la **evidencia salga sola** en el
formato de Registro de Ejecución (EJ), sin transcribir nada a mano.

## Cómo funciona
Los tests están etiquetados con la US/caso (ver `/casos-a-tests`). Se corre la
suite con salida JSON y el script `scripts/registro-ejecucion.mjs` la convierte
en un CSV con columnas: `ID de ejecución · Sprint · Caso de prueba asociado · Ejecutor · Resultado · Evidencia`.
`Resultado` mapea passed→Aprobado, failed→Fallido, skipped/todo→Bloqueado.

## Pasos

### Backend (Jest)
```bash
npm test -- --json --outputFile=jest-results.json
node scripts/registro-ejecucion.mjs jest-results.json --sprint="Sprint 3" --ejecutor="CI" > registro-ejecucion-back.csv
```

### Frontend (Vitest)
```bash
npm run test:cov -- --reporter=json --outputFile=vitest-results.json   # o: npx vitest run --reporter=json --outputFile=...
node scripts/registro-ejecucion.mjs vitest-results.json --sprint="Sprint 3" --ejecutor="CI" > registro-ejecucion-front.csv
```
> El script de `socialclub-backend/scripts/` sirve para ambos (el JSON de Vitest y el de Jest comparten estructura). Copiar el `.mjs` al front o invocarlo por ruta.

## Después
- Abrir/importar el CSV en la planilla del plan de testing (hoja de ejecuciones).
- Para pruebas **cruzadas** (DoD): pasar `--ejecutor="<nombre>"` del integrante que valida.
- Los casos de tipo **Aceptación / E2E** que no tengan test automatizado se registran aparte como ejecución **manual** (no salen de este flujo hasta que exista Playwright).

## Reglas
- La evidencia refleja la corrida real: no editar resultados a mano.
- Si un test falla, el CSV lo marca `Fallido` con el log; se arregla el código o el test, no el CSV.
