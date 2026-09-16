# Deuda técnica — SocialClub

Registro vivo de la deuda técnica del producto: qué hay, en qué orden conviene
atacarla, qué se resolvió y cómo. Cubre los dos repos (`socialclub-backend` y
`socialclub-frontend`).

- **Equipo:** Nullpointer
- **Última actualización:** 16/09/2026
- **Mantener este documento:** al cerrar un ítem, moverlo a
  [Resuelta](#deuda-resuelta) con su PR y fecha. Al detectar uno nuevo, sumarlo
  a [Pendiente](#deuda-pendiente) con un ID `DT-XX` correlativo.

> Los IDs **DT-01 a DT-14** son los que relevó el equipo. Los **DT-15 en
> adelante** salieron de la revisión del código del 15/09/2026 y están
> marcados como tal.

---

## Cómo priorizamos

El orden no es por esfuerzo ni por antigüedad, sino por daño real dividido
esfuerzo, respetando dependencias. De mayor a menor peso:

1. **Datos que se pierden o se filtran.**
2. **Funcionalidad incompleta que ya está en producción.**
3. **Bloqueantes de la Definition of Done** (cobertura mínima del 70 %).
4. **Presentación y experiencia de uso.**

---

## Estado de un vistazo

| Estado | Ítems |
|---|---|
| ✅ Resueltas | DT-03, DT-04, DT-07, DT-13, DT-14, DT-16, DT-19, DT-21 |
| 🔴 Críticas pendientes | DT-15 |
| 🟠 Altas pendientes | DT-01, DT-02, DT-05 |
| 🟡 Medias pendientes | DT-10, DT-11, DT-17, DT-18 |
| ⚪ Bajas pendientes | DT-06, DT-08, DT-09, DT-20 |

**Cobertura de tests** (medida el 16/09/2026, objetivo DoD **70 %**):

| Repo | Statements | Piso configurado |
|---|---|---|
| Frontend (Vitest) | 22,03 % | 22 % |
| Backend (Jest) | 50,20 % | 50 % |

Los dos repos tenían además el **CI en rojo** por configuración de lint, no por
código: ver [Extra](#extra--ci-del-frontend-en-rojo-desde-el-0709) al final.

El piso ("ratchet") solo puede subir: cada PR que agrega tests lo sube, y así
la cobertura no puede retroceder. En los dos repos está pegado al valor real,
así que cualquier retroceso corta el CI.

---

## Deuda pendiente

### 🔴 Críticas

#### DT-15 · Los adjuntos de documentación se pierden en cada despliegue
*Nuevo · backend + infra · 3 SP*

La documentación obligatoria (US-24) guarda el binario en el filesystem del
contenedor (`DOCS_STORAGE_DIR=storage/documentacion`). En Azure Container Apps
ese filesystem es **efímero**: cada revisión, reinicio o escalado borra los
archivos y la base queda con referencias a rutas que ya no existen. Ya está
desplegado así.

- **Evidencia:** `src/documentacion/storage.config.ts:17` · `.github/workflows/cd-main.yml` (no monta ningún volumen)
- **Arreglo:** mover el almacenamiento a Azure Blob Storage, o montar un Azure File Share en el Container App. Conservar `DOCS_STORAGE_DIR` como modo local. Decidir qué hacer con los registros que ya apuntan a rutas inexistentes.
- **Bloquea:** DT-09 (si se hace antes, repite el mismo bug).
- **Rama sugerida:** `issue/TASK-13-DT-15-Persistencia-adjuntos-azure`

### 🟠 Altas

#### DT-02 · Cobertura de testing backend
*backend · 5 SP*

50 % contra el 70 % que pide la DoD. El camino más rentable, en orden: los 8
controllers están en **0 %** y son triviales de testear (~12 puntos),
`personas` y `categorias` están enteros en 0 %, y `auditoria.service` está en
19 % siendo el corazón de RNF03. Primer paso, en el mismo commit: subir
`coverageThreshold` de 41 a 49 para fijar lo ya logrado.

- **Herramientas:** `/casos-prueba` → `/casos-a-tests` → `/ejecutar-pruebas`
- **Rama sugerida:** `issue/TASK-14-DT-02-Cobertura-controllers-y-auditoria`

#### DT-01 · Cobertura de testing frontend
*frontend · 8 SP*

De 22 % a 70 % no se llega en una rama. Conviene repartir por feature — una
rama por dominio sin tests (`auditoria`, `entradas`, `documentacion`,
`disciplinas`, `dashboard`) — y subir el piso en cada PR. **Regla de equipo:
ninguna rama de deuda técnica se mergea sin sus propios tests**; así DT-01
avanza sola con el resto del trabajo.

- **Rama sugerida:** `issue/TASK-15-DT-01-Cobertura-frontend-<feature>`

#### DT-05 · Falta activar/desactivar la cuota deportiva
*frontend · 1 SP*

El backend ya está listo: `ConfiguracionCuotaDeportiva.activo` existe,
`ActualizarCuotaDto` acepta `activo`, el service lo persiste y audita, el tipo
del front lo declara y la tabla ya muestra el badge Activo/Inactivo. **Falta
solo el botón** que mande `{ activo: false }`.

- **Evidencia:** `actualizar-cuota.dto.ts:14` · `cuotas.service.ts` (`actualizar`) · `CuotasTable.tsx`
- **Rama sugerida:** `issue/TASK-16-DT-05-Activar-desactivar-cuota-deportiva`

### 🟡 Medias

#### DT-11 · La pantalla de Inscripción no muestra a los inscriptos
*frontend · 3 SP*

`GET /inscripcion` ya devuelve todas las inscripciones con persona, disciplina
y categoría, ordenadas por fecha. La pantalla no lo consume:
`InscripcionPage` es solo el formulario de alta. Es trabajo de frontend, no de
API — salvo que se quiera paginar. Se resuelve junto con DT-17.

- **Rama sugerida:** `issue/TASK-17-DT-11-Listado-de-inscriptos`

#### DT-10 · La pantalla de Auditoría es interminable
*frontend · 2 SP*

Ya pagina de 20 en 20; lo que la hace larga es que solo se puede filtrar por
acción. El backend acepta además `entidad`, `responsableId`, `fechaDesde` y
`fechaHasta`.

- **Arreglo:** sumar esos filtros, selector de tamaño de página y encabezado fijo con scroll dentro de la tabla.
- **Rama sugerida:** `issue/TASK-18-DT-10-Filtros-de-auditoria`

#### DT-18 · IDs de casos de prueba colisionados
*Nuevo · documentación · 1 SP*

Los specs del frontend de usuarios referencian TC-006 a TC-012, pero en
`docs/exportables/casos-prueba.csv` los IDs TC-009 y TC-010 corresponden a
US-40 (cerrar sesión). Hoy la trazabilidad test ↔ planilla apunta a filas
equivocadas, y cada export con `/exportar-casos` agranda el problema.

- **Arreglo:** definir un rango de IDs por US (o un prefijo por repo) y renumerar la planilla junto con las etiquetas de los specs. Hacerlo **antes** de las ramas de cobertura.
- **Rama sugerida:** `issue/TASK-19-DT-18-Reconciliar-ids-casos-de-prueba`

#### DT-17 · Código muerto: `EditarInscripcionPage`
*Nuevo · frontend · incluido en DT-11*

El archivo existe (196 líneas) y no está importado en ningún lado — no tiene
ruta en `AppRouter`. Al hacer DT-11: o se conecta al listado nuevo, o se borra.

### ⚪ Bajas

#### DT-08 · Las entradas con QR no se pueden descargar en PDF
*frontend · 2 SP*

Hoy `ComprarEntradasPage` descarga el QR como PNG con `qrcode`, así que hay
salida funcional. Para PDF, `jspdf` en el cliente alcanza y evita endpoints
nuevos; si más adelante se quiere enviar la entrada por mail, conviene
generarlo en el backend. **Decidir eso antes de instalar nada.**

#### DT-09 · Imágenes en eventos
*backend + frontend · 5 SP*

`Evento` no tiene ningún campo de imagen: hay migración, endpoint de upload con
validación de tipo y tamaño, y UI de carga y preview. **No empezar antes de
DT-15**: hay que reusar el mecanismo de almacenamiento que quede definido ahí.

#### DT-20 · La edición de socio y de cuota social sigue en página aparte
*Nuevo · frontend · 2 SP*

Al unificar las altas en modales (DT-13, DT-14, DT-19) quedaron sin convertir
las ediciones: `EditarSocioPage`, `EditarCuotaSocialPage` y
`EditarParticipantePage` siguen siendo pantallas propias con navegación de ida
y vuelta. Es una inconsistencia visible: en la misma pantalla, "Nuevo" abre un
modal y "Editar" cambia de página.

- **Nota:** `EditarParticipantePage` tiene 369 líneas, así que conviene evaluarla aparte de las otras dos.

#### DT-06 · Historias de usuario para sumar al backlog
*gestión · 0 SP de código*

No es deuda de código: son tres historias de producto nuevas.

- US-X: Darme de baja como socio.
- US-Y: Reactivación / nueva alta de un ex-socio.
- US-Z: Baja automática por falta de pago.

**Baja automática implica un job programado y reglas de morosidad que hoy no
existen en el dominio.** Estimarlas en refinamiento y sacarlas de esta tabla.

---

## Deuda resuelta

### DT-16 · Endpoints de inscripción sin control de rol
**PR [#33](https://github.com/lucasgazzola/socialclub-backend/pull/33)** ·
`issue/TASK-12-DT-16-Proteger-endpoints-inscripcion` · 16/09/2026

`GET /inscripcion`, `GET /inscripcion/:id` y `DELETE /inscripcion/:id` no
declaraban `@Roles`, y `RolesGuard` devuelve `true` cuando no hay roles
requeridos: **cualquier usuario autenticado —incluido un SOCIO— podía listar a
todos los participantes con su DNI y borrar inscripciones**. El `DELETE`
además hacía un borrado físico sin registrar nada, así que una inscripción
podía desaparecer sin dejar rastro de quién la borró.

- **Los roles se declaran a nivel de clase**, no por handler. Así el próximo endpoint nace protegido: hay que optar explícitamente por ampliarlo. Es exactamente el modo en que falló — la ausencia del decorador no cerraba la puerta, la abría.
- **La baja pasó a ser lógica y auditada** (`accion: 'BAJA'`), dentro de una transacción y vía `AuditoriaService.registrar(params, tx)`, que ya aceptaba el cliente transaccional para garantizar atomicidad (RNF07).
- `findAll` y `findByPersonaId` devuelven solo inscripciones vigentes. `personas.findByDni` **ya filtraba** `activo: true` con el comentario «inscripciones vigentes», así que la baja lógica ya estaba diseñada: lo único que nunca se implementó fue el `remove()`. **No hizo falta migración**, `Inscripcion.activo` ya existía en el schema.
- `ParseIntPipe` en los dos handlers que usaban `+id` (un `/inscripcion/abc` daba `NaN` y terminaba en un 500 de Prisma en lugar de un 400), y los `@ApiOperation` que faltaban en tres endpoints.

**El `@@unique([personaId, disciplinaId])` obliga a resolver dos casos**, porque
con baja lógica la fila sobrevive:

1. **Re-inscripción.** `create` habría respondido «ya existe un participante con ese DNI inscripto en esta disciplina» para siempre. Ahora, si la fila está dada de baja, la reactiva y audita `REACTIVAR` — igual que `usuarios.create` reutiliza una `Persona` existente.
2. **Cambio de disciplina.** Si el participante ya tuvo una inscripción dada de baja en la disciplina destino, no se le puede mover el `disciplinaId` encima. Se decidió **reactivar la fila del destino y dar de baja la actual**: con el unique, cada fila representa «el estado de inscripción de esta persona en esta disciplina», no un período, así que no se borra nada y queda todo auditado. **Efecto a tener en cuenta: la inscripción resultante cambia de id**, así que el frontend tiene que refrescar y no asumir el mismo id después de un traslado.

De paso se quitó una consulta duplicada: la verificación del DNI y la del
destino consultaban lo mismo cuando el DNI no cambiaba.

**Tests:** 97 → **134**. El spec `inscripcion.roles.spec.ts` ejerce el guard
real contra los handlers reales, así que falla si alguien agrega un handler sin
roles o quita el `@Roles` de la clase — se verificó comentando el decorador
(13 casos en rojo). El módulo pasó de ~58 % a **84 %** de cobertura, y el piso
global de Jest subió de 41 % a 50 %.

### DT-03 · Pantalla de usuarios a grilla, con la fila modificada arriba
**PR [#60](https://github.com/lucasgazzola/socialclub-frontend/pull/60)** ·
`issue/TASK-10-DT-03-Grilla-de-usuarios` · 15/09/2026

El listado era una lista de tarjetas y el backend lo ordena por apellido, así
que al cambiarle el estado a alguien la fila quedaba perdida en el medio.

- `UsuariosGrid`: grilla de columnas en desktop; por debajo de `lg` las mismas filas se apilan como tarjetas, con **markup único** (no se duplica contenido ni se repite en lectores de pantalla).
- Al activar o desactivar, la fila pasa primera y queda resaltada (`aria-current`) hasta cambiar el filtro o recargar. Se descartó ordenar por `actualizadoEn` en el backend: rompía el orden alfabético y hacía que la lista se reordenara sola.
- Filtro por estado (todos/activos/inactivos) y baja del parámetro `incluirInactivos`, que el controller nunca recibió y no filtraba nada.
- `min-w-0` en el `<main>` de `AppLayout`: era un ítem flex con `min-width:auto`, crecía con su contenido y el scroll horizontal terminaba en la página en vez de quedar contenido en la tarjeta.

**Dos lecciones para la próxima grilla:**

1. Si el encabezado y las filas son **dos grillas separadas**, ningún track puede depender del contenido. Con `auto`, «Estado» y «Acciones» resuelven distinto en cada grilla y el desfase desalinea *todas* las columnas. Cada track tiene que ser `minmax(mínimo, Nfr)` o un ancho fijo.
2. `truncate` en un `<span>` inline **no hace nada**: `text-overflow` necesita un bloque. El truncado va en la celda. (El del nombre funcionaba de casualidad, porque su padre es flex y lo blockifica.)

Se verificó renderizando el markup real contra el CSS compilado a 1280, 1152 y
420 px, **descontando la barra lateral (`w-60`) y el `p-8` del layout**: en un
portátil de 1280 px el área de contenido real son 976 px, no 1280.

### DT-04 · `window.confirm` reemplazado por un diálogo del design system
**PR [#62](https://github.com/lucasgazzola/socialclub-frontend/pull/62)** ·
`issue/TASK-11-DT-04-Modales-y-dialogo-de-confirmacion` · 16/09/2026

`Modal` vivía en `features/usuarios/pages/components`, así que ninguna otra
pantalla podía reusarlo. Pasó a `src/components/ui` y se exporta desde el
índice del design system.

- El `Modal` estrena lo que le faltaba para ser navegable con teclado: cierra con **Escape**, atrapa el foco mientras está abierto, lo **devuelve al elemento que lo abrió** al cerrarse, bloquea el scroll del fondo y anuncia título y descripción con `aria-labelledby` / `aria-describedby`.
- El foco inicial va al primer control **del contenido**, no al primer enfocable del diálogo: en orden DOM ese es el botón de cerrar del encabezado, y abrir un formulario y caer en «Cerrar» no sirve para navegar con teclado.
- `ConfirmDialog` se construye encima: distingue la acción destructiva de la que no lo es y muestra el estado de carga de la operación que confirma.
- Las bajas y reactivaciones de usuario ya no usan `window.confirm`; la descripción dice qué implica el cambio y sobre quién.

### DT-13 · Formulario de nueva cuota deportiva a modal
### DT-14 · Formulario de nuevo evento a modal
### DT-19 · Alta de socio y de cuota social a modal
**PR [#62](https://github.com/lucasgazzola/socialclub-frontend/pull/62)** ·
misma rama · 16/09/2026

Los cuatro altas que quedaban fuera del patrón ahora abren un modal sobre su
listado, así no se pierde el contexto de lo que se estaba mirando:

| Pantalla | Antes | Ahora |
|---|---|---|
| Cuota deportiva (DT-13) | `Card` desplegable que empujaba la tabla hacia abajo | Modal |
| Evento (DT-14) | Navegaba a `/eventos/nuevo` | Modal |
| Cuota social (DT-19) | Navegaba a `/cuotas/social/nueva` | Modal |
| Socio (DT-19) | Navegaba a `/socios/nuevo` | Modal |

`CrearEventoPage`, `CrearCuotaSocialPage` y `CrearSocioPage` y sus rutas
quedaban sin ningún otro punto de entrada (no están en el menú ni las linkea
nadie más), así que se **eliminaron** en lugar de mantener dos caminos para lo
mismo. `useCrearEvento` pasa a avisar con un toast, que antes lo daba la
navegación de vuelta al listado.

Quedó pendiente la contracara: las **ediciones** siguen en página aparte
(DT-20).

### DT-07 · DNI duplicado en Usuario y Persona
**Ya estaba resuelta** al momento de la revisión · `TASK-9` + migración `119d943`

`dni` vive solo en `Persona`, `Usuario` es 1:1 con ella vía `personaId`, y el
service aplana `dni` en el DTO para no romper el contrato de la API. Lo que
**sí** sigue duplicado es `nombre`, `apellido` y `email` entre las dos tablas:
vale anotarlo como ítem aparte si algún día molesta, no como bloqueante.

### Extra · CI del frontend en rojo desde el 07/09
**PR [#61](https://github.com/lucasgazzola/socialclub-frontend/pull/61)** ·
`fix/Config-Lint-scripts` · 16/09/2026

No estaba en el registro y se descubrió al mandar DT-03 a `dev`: el workflow
fallaba desde el PR #51, cuando se sumaron los scripts de tooling de testing.
`eslint.config.js` daba los globals de Node a `**/*.cjs`, pero esos scripts son
`.mjs` → 18 errores de `no-undef`, todos en `scripts/`, ninguno en `src`.
**Con el CI rojo no se podía validar ningún PR contra `dev`.**

---

### DT-21 · Test que fallaba solo en local y de noche
*Nuevo · backend* · **PR [#32](https://github.com/lucasgazzola/socialclub-backend/pull/32)** ·
`fix/Config-Lint-backend` · 16/09/2026

`documentacion.service.spec.ts` › «rechaza una fecha de vencimiento anterior a
hoy» pasaba en CI y fallaba en las máquinas del equipo. El helper armaba la
fecha con `toISOString()` —en UTC— mientras el service compara contra el **día
local**: entre las 21:00 y las 00:00 en UTC−3, el «ayer» en UTC es el «hoy»
local, así que el service no rechazaba nada y el test esperaba un rechazo.

**CI corre en UTC, así que este tipo de bug nunca se ve ahí.** Cuando un test
de fechas falla en local y pasa en CI, sospechar de la zona horaria antes que
del código. Se verificó en `UTC`, `America/Argentina/Buenos_Aires`,
`Asia/Tokyo` y `Pacific/Kiritimati`.

### Extra · CI del backend en rojo
**PR [#32](https://github.com/lucasgazzola/socialclub-backend/pull/32)** ·
`fix/Config-Lint-backend` · 16/09/2026

`npm run lint` corre sobre `{src,test}/**/*.ts` con `projectService`, que exige
que cada archivo pertenezca a un proyecto TS, pero `tsconfig.json` excluye
`test`, `prisma` y `**/*spec.ts`: 17 errores de «was not found by the project
service», ninguno un problema real del código. Se agregó
`tsconfig.eslint.json` (extiende el de build e incluye esos archivos) sin
tocar el tsconfig de build.

> **Ojo:** `npm run lint` corre con `--fix`, así que en CI los problemas de
> formato se arreglan en el runner y nunca se reportan. Por eso el formato
> venía derivando en silencio. Conviene separar `lint` (sin fix, para CI) de
> `lint:fix` (local).

## Nomenclatura

Lo que ya usa el equipo, aplicado a la deuda técnica:

- **Ramas:** `issue/TASK-<n>-DT-<nn>-<Descripcion-en-kebab>` para deuda
  identificada; `fix/<Descripcion>` para arreglos de configuración o tooling.
  El número `TASK` es correlativo y global (el último usado va en la tabla de
  arriba).
- **Commits:** `<prefijo>[scope]: <descripción en minúscula>`, con el ID de la
  deuda como scope — `refactor[DT-03]: …`, `test[DT-01]: …`, `ci[lint]: …`.
  Prefijos válidos: `feat`, `fix`, `docs`, `test`, `ci`, `chore`, `refactor`.
  **Sin atribución de IA ni trailers de coautoría.**
- **Merge:** siempre por Pull Request a `dev`, aprobado por al menos otro
  integrante y enlazado a la tarjeta de GitHub Projects.

## Definition of Done aplicada a la deuda técnica

Vale repetirla porque estas tareas se sienten «chicas» y es justo donde se
saltean pasos:

1. Objetivo de la tarea cumplido.
2. Código commiteado y pusheado a la rama correspondiente.
3. Tests unitarios escritos y pasando, respetando el piso de cobertura del repo.
4. **Probada por un integrante que no la desarrolló** (pruebas cruzadas).
5. Probada en conjunto con el resto de lo que esté en curso.
6. Documentación actualizada — **incluido este archivo** y los casos en la
   matriz de pruebas.
7. Desplegada en el entorno de pruebas y accesible.

Sin los puntos 4 y 6, una rama de deuda técnica no está terminada.
