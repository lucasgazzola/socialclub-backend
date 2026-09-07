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

## Cómo lo usa la IA
- El `CLAUDE.md` de cada repo apunta acá.
- Los skills (`.claude/skills/`) leen estos archivos para generar salidas **con el formato exacto del equipo** (mismos IDs, columnas, secciones), en vez de inventar uno.
- Cuando actualices un doc, la IA usa la versión nueva automáticamente (queda versionado en git).

> Tip: no hace falta subir todo de una. Con los 4 archivos 🔴 arriba ya cerramos `CLAUDE.md` + `/casos-prueba`.
