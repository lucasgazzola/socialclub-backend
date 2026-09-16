# docs/ — Documentación del proyecto (fuente para la IA)

Esta carpeta es la **fuente de verdad** que leen los agentes de IA y los skills del equipo.
Para máxima precisión, dejá acá tus documentos reales (plantillas + ejemplos ya llenos).

## Formato
- Preferido: **Markdown (`.md`)**, **CSV (`.csv`)** o texto plano (`.txt`).
- Si el original está en Excel → exportá cada hoja relevante a `.csv`.
- Si está en Word/Google Docs → exportá/pegá a `.md` (no hace falta que quede perfecto; importa el contenido y la estructura de secciones).
- Nombrá los archivos como se indica abajo para que los skills los encuentren.

## Qué dejar (checklist)

### 🔴 Necesario para el primer entregable (`CLAUDE.md` + skill `/casos-prueba`)
- [ ] `definition-of-done.md` — la **Definition of Done** del equipo (incluida la cobertura mínima). *Lo consume:* `CLAUDE.md` de ambos repos.
- [ ] `convenciones-casos-prueba.md` — cómo escriben los casos: esquema de **IDs** (`TC-XXX`), **niveles de prioridad**, **tipos** (Unitario/Funcional/Integración/Seguridad), y qué va en cada columna. *Lo consume:* skill `/casos-prueba`.
- [ ] `plan-de-pruebas.csv` — la **planilla de casos actual** (export del Excel "Plan de testing"), para anclar el formato/columnas exactas.
- [ ] `ejemplos-historias-de-usuario.md` — **2–3 US completas con sus criterios de aceptación**, tal cual las escriben (indicá dónde viven: issues de GitHub, backlog, doc). *Lo consume:* `/casos-prueba` y `/nueva-us`.

### 🟠 Para el siguiente paso (`/cierre-sprint` + docs-as-code)
- [ ] `plantilla-cierre-sprint.md` — la **plantilla** del documento de cierre de sprint (estructura de secciones).
- [ ] `ejemplo-cierre-sprint.md` — **un cierre ya terminado** (p. ej. Sprint 2) como referencia de estilo y nivel de detalle.
- [ ] `historial-de-versiones.md` — el formato de la tabla de versiones que usan.

### 🟡 Gestión PMBOK (migración a docs-as-code, cuando quieras)
- [ ] `gestion-configuracion.md` — política de ramas/versionado/entornos.
- [ ] `gestion-riesgos.md`
- [ ] `gestion-interesados.md`
- [ ] `gestion-comunicaciones.md`
- [ ] `backlog.md` (o `.csv`) — US por sprint, Story Points y asignación por integrante. *Lo consume:* métricas.

## Documentos vivos de este directorio

Estos no son exports: se mantienen acá, en markdown, y se actualizan con cada
cambio. El markdown del repo es la **fuente accesible para todo el equipo** —
está versionado, se lee en GitHub y no depende de que nadie comparta un enlace.

| Documento | De qué trata | Versión navegable |
|---|---|---|
| [`DEUDA-TECNICA.md`](DEUDA-TECNICA.md) | Registro de la deuda de los dos repos: qué hay, en qué orden atacarla, qué se resolvió y con qué PR. Incluye las **decisiones pendientes del equipo**. | [ver](https://claude.ai/code/artifact/36ba0d37-622d-4197-b9ad-4f24a2c6968d) |
| [`PLAN-TESTING.md`](PLAN-TESTING.md) | Estado medido de la pata de testing, qué se automatiza con skills, qué hace falta para E2E y la secuencia de pasos. | [ver](https://claude.ai/code/artifact/b817ba9b-ac31-44c8-9dfb-c72ac923b7a3) |
| [`GUIA-IA-EQUIPO.md`](GUIA-IA-EQUIPO.md) | Cómo usar los skills del equipo. | — |

**Al cerrar un ítem de deuda hay que moverlo a «Deuda resuelta» con su PR y
fecha: es parte de la Definition of Done** (punto 6).

> ⚠️ **Sobre las versiones navegables:** son páginas más cómodas de leer para
> una reunión, pero **nacen privadas** — hay que compartirlas explícitamente
> desde el menú de la página para que el resto las abra. Y no se versionan: si
> el markdown y la página difieren, **manda el markdown de este repo**.

### Exportables para la planilla

`exportables/` guarda archivos **para copiar y pegar** en el `.xlsx` del plan de
testing; no reemplaza a la planilla, que sigue siendo la fuente de verdad de los
casos y su ejecución.

| Archivo | Va a la hoja |
|---|---|
| `casos-prueba.csv` | Casos de Prueba (dump completo, `TC-001` a `TC-090`) |
| `mapeo-DT-18.csv` | Referencia viejo → nuevo |
| `casos-prueba-US16-US32.csv` | Casos de Prueba (`TC-091` a `TC-107`, pegar **después** del dump) |
| `ejecucion-US16-US32.csv` | Ejecución de Pruebas (`EJ-28` a `EJ-46`) |

El próximo ID libre lo asigna `/exportar-casos` (`TC-108` con estos archivos
en el repo). No numerar a mano.

## Cómo lo usa la IA
- El `CLAUDE.md` de cada repo apunta acá.
- Los skills (`.claude/skills/`) leen estos archivos para generar salidas **con el formato exacto del equipo** (mismos IDs, columnas, secciones), en vez de inventar uno.
- Cuando actualices un doc, la IA usa la versión nueva automáticamente (queda versionado en git).

> Tip: no hace falta subir todo de una. Con los 4 archivos 🔴 arriba ya cerramos `CLAUDE.md` + `/casos-prueba`.
