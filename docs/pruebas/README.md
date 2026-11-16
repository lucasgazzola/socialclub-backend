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
        ├── README.md       ← qué muestra cada archivo y qué casos respalda
        └── e2e/            ← generado por las pruebas E2E: no se edita a mano
            ├── TC-XXX-NN.jpg   (una captura por paso del caso)
            ├── indice.json
            └── README.md
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

0. `npm run docs:comparar-planilla` (o el paso 0 de `/exportar-casos`, que baja
   la planilla viva de Drive) → confirma que nadie cargó casos por fuera del repo.
1. `/casos-prueba` → casos de la US (TSV temporal, fuera del repo).
2. `/exportar-casos` → los agrega a `casos-prueba.csv` con sus IDs.
3. `/ejecutar-pruebas` → agrega las ejecuciones a `ejecucion.csv` y, si hace
   falta, la evidencia en `evidencias/<US>/`.
4. `npm run docs:para-pegar` → regenera `para-pegar/*.tsv`.
5. Pegar cada TSV en su hoja de Drive desde la celda **A2**. No pegar los CSV:
   Sheets parte las filas en las celdas multilínea.

## Pruebas E2E con evidencia automática (TASK-43)

Las pruebas E2E viven en `socialclub-frontend/e2e/` (Playwright). Cada test es
la ejecución de un caso de esta planilla: su título empieza con el `TC-XXX` y
lleva la US como tag (`@US-XX`). Corren en el navegador contra el sistema real
(front + esta API + Postgres con migraciones y seed) y sacan una captura al
final de cada paso, con lo verificado resaltado.

```bash
# en socialclub-frontend, con Postgres levantado (docker compose up -d db en este repo)
npm run e2e                 # levanta API (puerto 3101, base socialclub_e2e) y front (5174)
npm run e2e:reporte         # reporte HTML: capturas, video y trace de cada caso
npm run e2e:evidencia -- --registrar   # capturas a evidencias/<US>/e2e/ + filas EJ
```

- La base `socialclub_e2e` es exclusiva de las pruebas: no se borra entre
  corridas (el seed la deja en su estado base y cada test usa DNI y emails
  únicos). Para una evidencia «limpia», correr con una base nueva:
  `E2E_DATABASE_URL=postgresql://socialclub:socialclub@localhost:5432/socialclub_otra_e2e?schema=public npm run e2e`.
- En GitHub, el workflow **E2E** del front corre en cada push a `dev` y a mano.
  Deja dos artifacts: `playwright-report` y `evidencia-e2e`, con las capturas y
  `ejecucion.csv` ya actualizados para copiar a este directorio.
- **Ejecutor** de esas filas: `CI (Playwright)`. La prueba cruzada de la DoD
  sigue siendo de una persona: puede revisar el reporte o las capturas.
- Las capturas se versionan **al cerrar una US o un sprint** (unos 4-5 MB por
  corrida completa); el resto del tiempo quedan en el artifact del CI.

Cantidades al día (casos, ejecuciones, cobertura): [`../PLAN-TESTING.md`](../PLAN-TESTING.md).
