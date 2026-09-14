---
name: exportar-casos
description: >-
  Toma los casos de prueba generados por /casos-prueba y los apenda a la planilla
  "Casos de Prueba" (CSV, que Excel abre nativamente), asignando IDs TC-XXX
  correlativos. Usalo para llevar los casos al entregable sin copiar a mano.
---

# Skill: exportar-casos (Equipo Nullpointer)

Objetivo: cerrar el circuito **definir → documentar**: que los casos de
`/casos-prueba` entren a la planilla del plan de testing **sin transcripción**.

## Cómo funciona
`/casos-prueba` produce un TSV (8 columnas, sin `ID Caso`). El script
`scripts/exportar-casos.mjs` lee ese TSV, busca el último `TC-XXX` de la planilla
y apenda las filas con IDs correlativos, respetando el quoting del CSV.

## Pasos
1. Generar los casos con `/casos-prueba` para la US y guardarlos en un `.tsv`
   (o pasarlos por stdin).
2. Apendar a la planilla:
```bash
node scripts/exportar-casos.mjs --casos=casos-US-XX.tsv --csv="docs/documentacion/desarrollo-del-producto/01 ... Plan de testing ... - Casos de Prueba.csv"
# Vista previa sin escribir:
node scripts/exportar-casos.mjs --casos=casos-US-XX.tsv --csv="<ruta>" --dry-run
```
3. Abrir el CSV en Excel/Sheets (o reimportarlo a la planilla `.xlsx`).

## Reglas
- Verificar que el TSV tenga exactamente **8 columnas** (US asociada → Tipo) y los
  **tipos oficiales** (Unitaria/Integral/Funcional/Regresión/Aceptación/No funcional).
- No duplicar casos ya existentes para esa US (revisar la planilla antes).
- Los `TC-XXX` los asigna el script; no ponerlos a mano.

## Nota sobre .xlsx nativo
Hoy se exporta a **CSV** (cero dependencias; Excel lo abre e importa). Si el equipo
necesita escribir directo en el `.xlsx` con formato, se puede sumar un script Node
con `exceljs` como dependencia de dev.
