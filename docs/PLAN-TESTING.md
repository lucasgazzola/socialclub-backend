# Plan de testing — subir la vara

Estado medido de la pata de testing del producto y plan por pasos. Complementa
a [`DEUDA-TECNICA.md`](DEUDA-TECNICA.md): allá está el detalle por ítem, acá la
estrategia de testing y su secuencia.

- **Equipo:** Nullpointer
- **Medido el:** 16/09/2026, sobre `socialclub-backend@dev` y `socialclub-frontend@dev`
- **Versión navegable:** <https://claude.ai/code/artifact/b817ba9b-ac31-44c8-9dfb-c72ac923b7a3>

---

## Estado al 16/09/2026

| | Backend | Frontend |
|---|---|---|
| Tests | 217 ✅ | 122 ✅ |
| Cobertura (statements) | 60,8 % | 31,9 % |
| Cobertura (ramas) | 67,0 % | 31,0 % |
| Piso configurado | 58 / 64 / 49 / 57 | 28 / 27 / 24 / 28 |
| Módulos/features sin ningún test | `categorias` | `auditoria`, `cuota-social`, `dashboard`, `disciplinas`, `documentacion` |

| | Cantidad |
|---|---|
| US implementadas (los dos repos) | ~24 |
| US con casos documentados | 16 |
| **US sin ningún caso** | **8** |
| Casos documentados | 107 filas · **107 IDs únicos** (`TC-001`–`TC-107`) |
| Ejecuciones registradas | 46 (`EJ-01` a `EJ-46`) |

**Objetivo de la DoD: 70 % de cobertura.** Faltan ~10 puntos en el backend y
~38 en el frontend.

---

## Lo que encontramos al medir

El problema no era la cantidad de tests: era que **nadie se daba cuenta cuando
se rompían**.

- **Los dos CI estaban en rojo.** El del backend por configuración de lint desde el 7/9; el del frontend desde el PR #64, que **se mergeó con el CI ya fallando**.
- **Un test que nunca pasó llegó a `dev`.** Los cuatro casos de `ValidarAccesoPage` (US-31) no mockeaban `useEventos`, así que la página se quedaba en la pantalla de selección y el escáner nunca se renderizaba.
- **Un test quedó viejo en un día.** Se renombró un botón de «Comprar entradas» a «Generar entradas» y el test que lo buscaba por texto visible se rompió. Consultar por copy hace los tests frágiles ante cambios que no son bugs.
- **Con la suite en rojo no hay cobertura.** Vitest no emite el reporte si algo falla, así que mientras el frontend estuvo rojo el piso no medía nada — el número real era 31,9 %, no el 22 % que teníamos anotado.
- **El 70 % de los casos documentados no tenía ejecución registrada.**

---

## Qué se automatiza con skills

### Ya funciona

`/casos-prueba` genera los casos leyendo el código real → `/casos-a-tests` los
convierte en tests → `/ejecutar-pruebas` corre la suite y exporta la evidencia
→ `/exportar-casos` los lleva a la planilla.

> Los cuatro estaban con el **formato equivocado** (8 columnas en vez de 10,
> tipos que no existen en la planilla, TSV en lugar de CSV). Corregidos contra
> el `.xlsx` real el 16/09.

### Falta escribir

- **`/auditar-planilla`** — contrastar la planilla contra el código y reportar discrepancias. Hecho a mano una vez, destapó DT-24 (casos que esperan cuotas que no existen), DT-25 (append-only sin respaldo en la base) y los IDs duplicados. Automatizado es un comando antes de cada entrega.
- **`/cobertura-por-us`** — mapear US → módulos → cobertura → huecos, para elegir qué historia atacar con números. Es lo que permitió ver que US-16 estaba mergeada con 236 líneas en 0 %.

### No se automatiza

Decidir **qué vale la pena testear** (que los tests sean representativos y no
«testear por testear»), la **prueba cruzada** por otro integrante (punto 4 del
DoD) y la **conformidad del PO**.

---

## Pruebas E2E

Recomendación: **Playwright** sobre Cypress — paraleliza mejor, corre los tres
motores con un solo binario, y su trace viewer hace que un fallo en CI sea
diagnosticable sin reproducirlo en local, que es donde estos frameworks se
abandonan.

### Qué hace falta antes del primer flujo

1. **Datos por corrida.** Ya hay `docker compose` y seed; falta que cada corrida arranque de un estado conocido (reset + seed).
2. **Selectores estables.** Sin `data-testid` en los puntos que los tests interrogan, los E2E se rompen con cada ajuste de copy y el equipo los empieza a ignorar. Ya nos pasó con un test unitario esta semana.
3. **Job de CI aparte**, con Postgres y la API levantadas. Conviene que corra sobre `dev` y no que bloquee cada PR, por el tiempo que suma.

### Los cuatro flujos que valen el esfuerzo

Cruzan módulos, y los tests unitarios con mocks no dicen nada sobre si las
piezas encajan entre sí.

| Flujo | US | Por qué |
|---|---|---|
| Crear evento → generar entradas con QR → validar acceso → rechazar reingreso | US-29 / 30 / 31 | Es el ciclo completo del producto y hoy no se prueba entero |
| Inscribir → documentación obligatoria → baja lógica → re-inscripción | US-05 / 24 / 07 | Toca la lógica más delicada del backend, hoy solo cubierta con mocks |
| Crear usuario → login → 403 en endpoints ajenos → baja → login bloqueado | US-01 / 03 / 39 | Los permisos por rol son el agujero que ya nos encontró DT-16 |
| Configurar cuota social del período siguiente → verificar que no rige → rotación | US-16 | La vigencia por período es puramente temporal y frágil |

**Costo:** ~1 sprint de armado y 1-2 días por flujo.

---

## Lo que sostiene la vara

No es tooling. **Se mergeó un PR con el CI en rojo, un test que nunca pasó
entró a `dev`, y un test propio se rompió sin que nadie lo notara en un día.**
Con ese proceso, cualquier automatización se degrada sola.

### Ya activado (16/09)

**Branch protection en `dev`** en los dos repos: exige que el CI pase
(`build` en el frontend, `test` en el backend) y no admite force-push ni
borrado de la rama.

Dos decisiones que quedaron tomadas y son reversibles:

- **No se exige revisor ajeno**, porque hoy el equipo auto-mergea y activarlo cambiaría el flujo de golpe. Es el punto 4 del DoD y merece decidirse aparte.
- **Queda salida de emergencia para el dueño del repo** (`enforce_admins: false`), para no quedar trabados a horas de una entrega.

### Pendiente, en orden de impacto sobre esfuerzo

1. **Tests en el mismo PR que la funcionalidad.** Ya es el punto 3 del DoD pero nada lo exige. Es lo que hace que la cobertura avance sola en lugar de necesitar sprints dedicados.
2. **`data-testid`** en los puntos que los tests interrogan.
3. **Exigir revisor ajeno** cuando el equipo lo decida.

---

## Secuencia

| Paso | Qué | Esfuerzo | Estado |
|---|---|---|---|
| **0** | Destrabar: tests rojos, lint, branch protection | 1 SP | ✅ hecho |
| **1** | Renumerar la planilla (DT-18) | 2 SP | ✅ hecho — PRs backend #39 y frontend #68 |
| **2** | Skills `/auditar-planilla` y `/cobertura-por-us` | 3 SP | hacen que el paso 3 cueste un tercio |
| **3** | Barrido por historia: las 8 US sin casos + los 5 features en cero | 8-13 SP | |
| **4** | E2E con Playwright: armado + los 4 flujos | 8 SP | va al final a propósito |

El paso 1 ya está hecho: los IDs son secuenciales y únicos, y `/exportar-casos`
es el único asignador. El paso 2 es el que hace que el 3 cueste un tercio. El
paso 4 va último porque sobre una base de tests unitarios que no se rompe sola
los E2E agregan confianza, y sobre una base frágil agregan ruido.
