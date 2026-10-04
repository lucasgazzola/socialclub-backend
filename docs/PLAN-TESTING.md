# Plan de testing — subir la vara

Estado medido de la pata de testing del producto y plan por pasos. Complementa
a [`DEUDA-TECNICA.md`](DEUDA-TECNICA.md): allá está el detalle por ítem, acá la
estrategia de testing y su secuencia.

- **Equipo:** Nullpointer
- **Medido el:** 04/10/2026, sobre `dev` + TASK-43 (medición anterior: 01/10/2026)
- **Versión navegable:** <https://claude.ai/code/artifact/b817ba9b-ac31-44c8-9dfb-c72ac923b7a3>

---

## Estado al 04/10/2026

| | Backend | Frontend |
|---|---|---|
| Tests unitarios | 651 ✅ (+5 contra Postgres) | 458 ✅ |
| Pruebas E2E (Playwright, sistema real) | — | **22 casos ✅** en 5 flujos |
| Cobertura (statements) | **87,7 %** ✅ | **70,5 %** ✅ |
| Cobertura (ramas) | 76,6 % | 69,3 % |
| Piso configurado (stmts / ramas / funcs / líneas) | 70 / 70 / 61 / 69 | 67 / 66 / 57 / 68 |
| Módulos/features sin ningún test | `categorias` (categorías de socio) | `auditoria`, `cuota-social`, `dashboard` |

| | Cantidad |
|---|---|
| US implementadas (los dos repos) | ~40 |
| US con casos documentados | 27 |
| Casos documentados | 181 filas (`TC-001`–`TC-181`) |
| Ejecuciones registradas | 142 (`EJ-01` a `EJ-142`) |
| Casos con ejecución E2E automática | 22 (`EJ-121` a `EJ-142`) |

**Objetivo de la DoD: 70 % de cobertura.** Los dos repos lo superan: backend
87,7 % y frontend 70,5 %.

**04/10/2026 · TASK-43 — Pruebas E2E con evidencia.** Hasta acá todos los
tests usaban mocks: ninguno probaba que front, API y base funcionaran juntos.
Ahora 22 casos de la planilla corren en el navegador contra el sistema real y
dejan una captura por paso (ver [Pruebas E2E](#pruebas-e2e)). **En la primera
pasada encontraron cuatro bugs que los tests con mocks no veían**, ya
corregidos:
- El **delegado no podía inscribir a nadie**: `GET /disciplinas` le respondía
  403 y el selector de disciplina quedaba vacío (US-05).
- **Secretaría no podía cobrar la cuota deportiva**: `GET /personas/dni/:dni`
  le respondía 403 al COLABORADOR (US-21).
- **No se podían comprar entradas de un evento sin período de venta**, que es
  opcional desde Task-E8: la página lo exigía (US-52).
- El **control de acceso nunca mostraba «Entrada ya utilizada» ni «Entrada
  expirada»**: leía el código HTTP de un lugar donde el cliente no lo deja
  (US-31, DT-33). El test unitario simulaba el error de axios y pasaba.

Además, los 17 tests de `*.e2e-spec.ts` del backend (auth, socios y usuarios)
no los ejecutaba ninguna configuración de Jest; ahora corren con la suite.

Últimas incorporaciones (04/10/2026, TASK-39 a TASK-42):
- **Primer test contra Postgres real** (DT-25): `auditoria.inalterable.spec.ts`
  verifica los triggers que vuelven inalterable la auditoría. El CI crea una
  base de integración con `prisma migrate deploy` y la pasa en
  `DB_INTEGRACION_URL`; sin esa variable la suite se saltea. Es la base para
  los tests de integración de abajo.
- **Contrato de Swagger** (DT-26): `respuestas.spec.ts` arma el documento real
  y falla si una operación queda sin respuesta exitosa o sin errores.
- DT-42 (alertas por disciplina del delegado) y DT-41 (deuda deportiva sobre
  todos los períodos de inscripción): casos `TC-173`–`TC-179` y ejecuciones
  `EJ-112`–`EJ-120`, que incluyen una nueva de `TC-024` y `TC-074` a nivel base.
  Ejecutadas por el desarrollador; **pendiente la prueba cruzada**.

Anteriores (04/10/2026, TASK-37 y TASK-38): el control de acceso
con QR (`validarAcceso`, US-31) no tenía ningún test; ahora cubre válida,
usada, expirada, evento terminado, QR inexistente y doble validación. También
se testean el fin del evento, la tarea `cierre-de-eventos`, la compra para un
evento terminado y activar/desactivar tarifas.

Anteriores (03/10/2026): US-26 (alertas de documentación con aviso
por email) con 13 casos (`TC-160`–`TC-172`) y su ejecución (`EJ-99`–`EJ-111`):
el envío se probó con SMTP real local (Mailpit) y con un test de integración
contra un servidor SMTP en memoria; capturas en `docs/pruebas/evidencias/US-26/`.
Falta probarlo con el proveedor gratuito;
**pendiente la prueba cruzada**.

Anteriores (01/10/2026): US-44 y US-48 a US-51 (categorías de
disciplina) con 25 casos (`TC-135`–`TC-159`) y su ejecución (`EJ-74`–`EJ-98`,
ejecutadas por el desarrollador, **pendiente la prueba cruzada**). Se corrigió
el test intermitente de eventos (DT-38), que cortaba el CI de vez en cuando.

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

**Con la planilla viva de Drive (03/10):** `/exportar-casos` baja el plan de
testing por su ID y `scripts/comparar-planilla.py` lo contrasta con
`docs/pruebas/`: detecta casos cargados en Drive sin pasar por el repo (y los
importa con `--importar`), filas con el mismo ID y distinto contenido, e IDs
duplicados. El próximo ID sale de la planilla real. `/backlog` lee los criterios
de aceptación vigentes del backlog. Sin conector de Drive, los dos usan la copia
local o se omiten: no frenan. Ver `docs/README.md` § *Planillas en Drive*.

### Falta escribir

- **`/auditar-planilla`** — contrastar la planilla contra el código y reportar discrepancias. Hecho a mano una vez, destapó DT-24 (casos que esperan cuotas que no existen), DT-25 (append-only sin respaldo en la base) y los IDs duplicados. Automatizado es un comando antes de cada entrega.
- **`/cobertura-por-us`** — mapear US → módulos → cobertura → huecos, para elegir qué historia atacar con números. Es lo que permitió ver que US-16 estaba mergeada con 236 líneas en 0 %.

### No se automatiza

Decidir **qué vale la pena testear** (que los tests sean representativos y no
«testear por testear»), la **prueba cruzada** por otro integrante (punto 4 del
DoD) y la **conformidad del PO**.

---

## Pruebas E2E

**Hecho en TASK-43** con **Playwright** (paraleliza mejor que Cypress y su
trace viewer permite diagnosticar un fallo del CI sin reproducirlo).

### Cómo funcionan

- Viven en `socialclub-frontend/e2e/`. Cada corrida levanta la API de este
  repo contra una base propia (`socialclub_e2e`, migraciones + seed) y el front
  apuntando a ella. Los datos de cada test se crean con DNI y emails únicos.
- **Cada test es un caso de la planilla**: el título empieza con su `TC-XXX` y
  la US va como tag. Sus pasos son los de la columna *Pasos*, y cada uno deja
  una captura con lo verificado resaltado.
- `scripts/evidencia-e2e.mjs` (front) convierte la corrida al formato del
  equipo: capturas en `docs/pruebas/evidencias/<US>/e2e/` y filas `EJ-NN` con
  Ejecutor «CI (Playwright)». Ver [`pruebas/README.md`](pruebas/README.md).
- **CI:** workflow *E2E* del front, en cada push a `dev` y a mano (eligiendo la
  rama del backend). No bloquea los PR. Publica el reporte HTML (capturas,
  video y trace) y la evidencia como artifacts.

### Flujos cubiertos

| Flujo | Casos | US |
|---|---|---|
| Inscripción con documentación faltante → alerta al delegado de esa disciplina | TC-017, TC-162, TC-176, TC-173 | 05, 26 |
| Sesión y ciclo de vida de un usuario (alta, baja, login bloqueado, logout) | TC-085, TC-086, TC-001, TC-013, TC-014, TC-088, TC-089 | 39, 01, 03, 40 |
| Evento → compra de entradas con QR → validación en la puerta → reingreso rechazado | TC-059, TC-069, TC-180, TC-181 | 29, 30, 52, 31 |
| Cuota social del período siguiente y cobro de la cuota deportiva hasta «al día» | TC-091, TC-117, TC-110, TC-116 | 16, 21 |
| Alta y baja de un socio | TC-026, TC-039, TC-043 | 12, 14 |

**Duración:** ~1,5 minutos los 22 casos (más el arranque de la API).

### Próximos flujos que conviene sumar

- Cobro de la cuota social desde la ficha del socio y autoservicio «Mis cuotas» (US-17, US-10).
- Edición de participante con cambio de categoría y nueva documentación exigida (US-06).
- Baja y reinscripción en una disciplina, verificando la deuda anterior (DT-41).
- Carga de documentación con archivo y la alerta que desaparece (US-24, US-26).

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
| **4** | E2E con Playwright: armado + los flujos principales | 8 SP | ✅ hecho — TASK-43 (5 flujos, 22 casos) |

El paso 1 ya está hecho: los IDs son secuenciales y únicos, y `/exportar-casos`
es el único asignador. El paso 2 es el que hace que el 3 cueste un tercio. El
paso 4 va último porque sobre una base de tests unitarios que no se rompe sola
los E2E agregan confianza, y sobre una base frágil agregan ruido.
