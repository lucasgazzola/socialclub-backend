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

## Documentación formal (`documentacion/`)

Los entregables de la cátedra (Sprint 0 a 5, plan de testing, seguridad,
gestión del proyecto: charter, alcance, ciclo de vida, interesados, riesgos)
viven en **Google Drive**. Cada integrante puede bajar una copia a
`docs/documentacion/` (`desarrollo-del-producto/` y `gestion-del-proyecto/`);
la carpeta está en `.gitignore` porque son binarios (`.docx`, `.xlsx`, `.pdf`).

Los skills la leen cuando está: `/casos-prueba` toma la plantilla del plan de
testing y la Definition of Done del documento *03 · Ciclo de vida*;
`scripts/ids-planilla.py` lee los IDs de la planilla `.xlsx`.
