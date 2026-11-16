# docs/ — Documentación del proyecto

Documentación de **SocialClub** (equipo Nullpointer) que vive en el repo. Es la
fuente que leen el equipo, los agentes de IA (`CLAUDE.md`) y los skills
(`.claude/skills/`). Cubre los dos repos: el frontend apunta acá.

```
docs/
├── README.md                 ← este índice
├── DEUDA-TECNICA.md          ← documentos vivos (se actualizan con cada cambio)
├── PLAN-TESTING.md
├── RUNBOOK-OPERACIONES.md
├── GUIA-IA-EQUIPO.md
├── decisiones/               ← decisiones de arquitectura (ADR)
├── pruebas/                  ← casos, ejecuciones, TSV para Drive y evidencias
└── documentacion/            ← documentos formales de Drive (local, no versionado)
```

## Documentos vivos

Se mantienen en markdown y se actualizan con cada cambio. El markdown del repo
es la **fuente accesible para todo el equipo**: está versionado, se lee en
GitHub y no depende de que nadie comparta un enlace.

| Documento | De qué trata | Versión navegable |
|---|---|---|
| [`DEUDA-TECNICA.md`](DEUDA-TECNICA.md) | Deuda de los dos repos: qué hay, en qué orden atacarla, qué se resolvió y con qué PR. Incluye las **decisiones pendientes del equipo**. | [ver](https://claude.ai/code/artifact/36ba0d37-622d-4197-b9ad-4f24a2c6968d) |
| [`PLAN-TESTING.md`](PLAN-TESTING.md) | Estado medido del testing (tests, cobertura, casos y ejecuciones), qué se automatiza con skills, E2E y próximos pasos. | [ver](https://claude.ai/code/artifact/b817ba9b-ac31-44c8-9dfb-c72ac923b7a3) |
| [`RUNBOOK-OPERACIONES.md`](RUNBOOK-OPERACIONES.md) | Comandos para operar Azure, GitHub y Vercel (promote `dev → test`, logs, reset de `socialclub_test`, CORS, secrets de tareas). Complementa [`DESPLIEGUE.md`](../DESPLIEGUE.md). | — |
| [`GUIA-IA-EQUIPO.md`](GUIA-IA-EQUIPO.md) | Cómo usamos la IA y los skills del equipo. | — |

**Al cerrar un ítem de deuda hay que moverlo a «Deuda resuelta» con su PR y
fecha: es parte de la Definition of Done** (punto 6).

> ⚠️ **Sobre las versiones navegables:** son páginas más cómodas para una
> reunión, pero **nacen privadas** (hay que compartirlas desde el menú de la
> página) y no se versionan. Si difieren del markdown, **manda el markdown**.

## Decisiones de arquitectura

[`decisiones/`](decisiones/README.md): una decisión por archivo, con contexto,
patrones aplicados, alternativas descartadas y consecuencias. Se escribe una
cada vez que un cambio afecta a más de un módulo.

## Pruebas

[`pruebas/`](pruebas/README.md): espejo en git de la planilla *Plan de testing
del producto*. Un CSV consolidado por hoja (`casos-prueba.csv`,
`ejecucion.csv`), los TSV que se pegan en Drive (`para-pegar/`, se regeneran
con `npm run docs:para-pegar`) y la evidencia de cada historia
(`evidencias/US-XX/`).

## Planillas en Drive

Dos planillas siguen vivas en Drive y el equipo las edita ahí. **No hace falta
descargarlas**: con el conector de Google Drive, Claude las lee en vivo por su ID
(skills `/backlog` y `/exportar-casos`). Sin el conector, se baja una copia a
`docs/documentacion/desarrollo-del-producto/` y los mismos scripts la usan; si
no hay ninguna, avisan y siguen sin fallar.

| Planilla | Archivo en Drive | ID | Hojas | Para qué |
|---|---|---|---|---|
| **Product Backlog** | `01 UTN FRVM - PF 2026 – Sprint 0 - Equipo 12 v1.0.xlsx` (carpeta de Lautaro) | `1P3uS233zCk8MnneNW7PWXtdd6eGiVKYk` | *Product Backlog*, *User Story Mapping*, *Cronograma Gantt* | Historias con descripción, **criterios de aceptación**, prioridad, SP, sprint, estado y encargado |
| **Plan de testing** | `01 UTN FRVM - PF 2026 – Plan de testing del producto - Equipo 12 v1.0.xlsx` (carpeta de Lautaro) | `10D45E7kHWrEoQtNLveRiFosWVPu9pAuY` | *Casos de Prueba*, *Ejecución de Pruebas*, *Defectos*, *Conformidad PO*, *Resumen* | Entregable de testing; su espejo en git es [`pruebas/`](pruebas/README.md) |

Enlaces: [backlog](https://drive.google.com/file/d/1P3uS233zCk8MnneNW7PWXtdd6eGiVKYk/view) ·
[plan de testing](https://drive.google.com/file/d/10D45E7kHWrEoQtNLveRiFosWVPu9pAuY/view).

| Comando | Qué hace |
|---|---|
| `npm run docs:backlog -- --us 26` | Detalle de una US con sus criterios (también `--sprint 5`, `--encargado Gazzola`, `--csv`) |
| `npm run docs:comparar-planilla` | Compara la planilla de testing con `pruebas/`: casos cargados solo en Drive, faltantes, mismo ID con distinto contenido, duplicados. Con `-- --importar` suma al repo lo que solo está en Drive |
| `python3 scripts/drive-a-xlsx.py <descarga> <salida.xlsx>` | Convierte una descarga del conector de Drive en `.xlsx` |

Los dos comandos aceptan `-- --xlsx <archivo>` para usar otra copia.

> **Si cambia el ID:** el ID se mantiene mientras se edite el mismo archivo o
> se suba una versión nueva sobre él (*Administrar versiones*). Si alguien sube
> otro archivo con el mismo nombre o lo convierte a Google Sheets, el ID cambia:
> actualizarlo en esta tabla. Hay copias viejas que **no** son las vigentes: un
> plan de testing en la carpeta de Colque (07/09) y `Cronograma_y_Backlog_SocialClub.xlsx` (junio).

## Documentación formal (`documentacion/`)

Los entregables de la cátedra (Sprint 0 a 5, plan de testing, seguridad,
gestión del proyecto: charter, alcance, ciclo de vida, interesados, riesgos)
viven en **Google Drive**. Cada integrante puede bajar una copia a
`docs/documentacion/` (`desarrollo-del-producto/` y `gestion-del-proyecto/`);
la carpeta está en `.gitignore` porque son binarios (`.docx`, `.xlsx`, `.pdf`).

Los skills la leen cuando está: `/casos-prueba` toma la plantilla del plan de
testing (`.docx`) y la Definition of Done del documento *03 · Ciclo de vida*.
**Las planillas vivas (backlog y plan de testing) no se bajan:** se leen desde
Drive (ver *Planillas en Drive*). Una copia local solo hace falta para trabajar
sin el conector, y los scripts avisan que puede estar desactualizada.
