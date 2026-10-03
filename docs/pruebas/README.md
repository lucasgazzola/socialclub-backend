# Pruebas — casos, ejecuciones y evidencias

Espejo versionado de la planilla *Plan de testing del producto* (Drive). La
planilla sigue siendo el entregable; esto es lo que la alimenta y lo que queda
en git.

```
pruebas/
├── casos-prueba.csv        ← hoja «Casos de Prueba»     (TC-001 …)  · fuente
├── ejecucion.csv           ← hoja «Ejecución de Pruebas» (EJ-01 …)  · fuente
├── para-pegar/             ← derivados: se regeneran, no se editan
│   ├── casos-prueba.tsv
│   └── ejecucion.tsv
└── evidencias/
    └── US-XX/              ← capturas, respuestas de la API, etc.
        └── README.md       ← qué muestra cada archivo y qué casos respalda
```

## Reglas

- **Un solo archivo por hoja.** Los casos y las ejecuciones nuevos se agregan
  al final de `casos-prueba.csv` y `ejecucion.csv`. No se crean archivos por
  historia: duplicaban filas y crecían sin control.
- **Formato de los CSV:** todas las celdas entre comillas, BOM UTF-8 y saltos
  de línea reales dentro de las celdas (como en la planilla). Al agregar filas
  no se reescriben las anteriores.
- **Los IDs no se numeran a mano.** Los `TC-XXX` los asigna
  `scripts/exportar-casos.mjs` (skill `/exportar-casos`); los `EJ-NN` siguen
  al último de `ejecucion.csv` (skill `/ejecutar-pruebas`).
- **Lo que no entra en una celda** (capturas, emails, respuestas completas) va
  en `evidencias/<US>/`, y la columna *Evidencia* lo cita por ruta.

## Flujo al cerrar una historia

1. `/casos-prueba` → casos de la US (TSV temporal, fuera del repo).
2. `/exportar-casos` → los agrega a `casos-prueba.csv` con sus IDs.
3. `/ejecutar-pruebas` → agrega las ejecuciones a `ejecucion.csv` y, si hace
   falta, la evidencia en `evidencias/<US>/`.
4. `npm run docs:para-pegar` → regenera `para-pegar/*.tsv`.
5. Pegar cada TSV en su hoja de Drive desde la celda **A2**. No pegar los CSV:
   Sheets parte las filas en las celdas multilínea.

Cantidades al día (casos, ejecuciones, cobertura): [`../PLAN-TESTING.md`](../PLAN-TESTING.md).
