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
node scripts/exportar-casos.mjs --casos=casos-US-XX.tsv --csv=docs/pruebas/casos-prueba.csv
# Vista previa sin escribir:
node scripts/exportar-casos.mjs --casos=casos-US-XX.tsv --csv="<ruta>" --dry-run
```
3. Regenerar el TSV para Drive: `npm run docs:para-pegar` y pegar
   `docs/pruebas/para-pegar/casos-prueba.tsv` desde **A2**.

El TSV de entrada de este paso es temporal (scratchpad): no se versiona ni se
deja en `docs/`.

## Reglas
- Verificar que el TSV tenga **8 o 9 columnas** (US asociada → Tipo, y opcionalmente
  Ejecutor) y los **tipos de la planilla**: `Unitario`, `Funcional`, `Integración`,
  `No funcional` (ver `/casos-prueba`).
- No duplicar casos ya existentes para esa US (revisar la planilla antes).
- Los `TC-XXX` los asigna el script; no ponerlos a mano.

## ⚠️ Los IDs los asigna solo este script

No numerar a mano ni calcular el próximo `TC-XXX` mirando una sola fila. El
script lee el máximo de:

1. la hoja **Casos de Prueba** del `.xlsx` (`scripts/ids-planilla.py`);
2. los CSV de `docs/pruebas/` (el consolidado `casos-prueba.csv`).

Si la planilla tiene IDs duplicados, el script **se niega a asignar**. Desde
DT-18 los IDs son secuenciales y únicos; `--dry-run` muestra el próximo.

El formato de salida son **10 columnas** (incluye `Ejecutor`) y los `Pasos`
llevan saltos de línea reales, así que el intercambio va en **CSV con quoting**,
no en TSV.

## Nota sobre .xlsx nativo
Hoy se exporta a **CSV** (cero dependencias; Excel lo abre e importa). Si el equipo
necesita escribir directo en el `.xlsx` con formato, se puede sumar un script Node
con `exceljs` como dependencia de dev.
