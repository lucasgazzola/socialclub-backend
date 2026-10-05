# Plan de testing — subir la vara

Estado medido de la pata de testing del producto y plan por pasos. Complementa
a [`DEUDA-TECNICA.md`](DEUDA-TECNICA.md): allá está el detalle por ítem, acá la
estrategia de testing y su secuencia.

- **Equipo:** Nullpointer
- **Medido el:** 01/10/2026, sobre `dev` + las ramas `fix/US-50-Categorias-inactivas-en-inscripcion` (medición anterior: 16/09/2026)
- **Versión navegable:** <https://claude.ai/code/artifact/b817ba9b-ac31-44c8-9dfb-c72ac923b7a3>

---

## Estado al 03/10/2026

| | Backend | Frontend |
|---|---|---|
| Tests | 586 ✅ | 437 ✅ |
| Cobertura (statements) | **77,8 %** ✅ | **70,1 %** ✅ |
| Cobertura (ramas) | 78,5 % | 69,1 % |
| Piso configurado (stmts / ramas / funcs / líneas) | 70 / 70 / 61 / 69 (antes 58 / 64 / 49 / 57) | 33 / 33 / 28 / 33 (antes 28 / 27 / 24 / 28) |
| Módulos/features sin ningún test | `categorias` (categorías de socio) | `auditoria`, `cuota-social`, `dashboard` |

| | Cantidad |
|---|---|
| US implementadas (los dos repos) | ~40 |
| US con casos documentados | 26 |
| Casos documentados | 179 filas (`TC-001`–`TC-179`) |
| Ejecuciones registradas | 120 (`EJ-01` a `EJ-120`) |

**Objetivo de la DoD: 70 % de cobertura.** Los dos repos lo superan: backend
77,8 % y frontend 70,1 % (DT-01, TASK-34).

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
