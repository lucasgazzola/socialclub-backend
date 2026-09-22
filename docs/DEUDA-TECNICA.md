# Deuda técnica — SocialClub

Registro vivo de la deuda técnica del producto: qué hay, en qué orden conviene
atacarla, qué se resolvió y cómo. Cubre los dos repos (`socialclub-backend` y
`socialclub-frontend`).

- **Equipo:** Nullpointer
- **Última actualización:** 22/09/2026
- **Mantener este documento:** al cerrar un ítem, moverlo a
  [Resuelta](#deuda-resuelta) con su PR y fecha. Al detectar uno nuevo, sumarlo
  a [Pendiente](#deuda-pendiente) con un ID `DT-XX` correlativo.

> Los IDs **DT-01 a DT-14** son los que relevó el equipo. Los **DT-15 en
> adelante** salieron de la revisión del código del 15/09/2026 y están
> marcados como tal. Los **DT-27 en adelante** salieron del análisis
> funcional de dominio del 22/09/2026 (documentación, inscripciones, entradas
> y cuotas) y están marcados como `Nuevo · funcional`.

---

## Índice

- [Cómo priorizamos](#cómo-priorizamos)
- [Estado de un vistazo](#estado-de-un-vistazo)
- [Decisiones pendientes del equipo](#decisiones-pendientes-del-equipo)
  - [🔴 Persistencia de los adjuntos en Azure (DT-15)](#persistencia-de-los-adjuntos-en-azure-dt-15---riesgo-activo)
  - [🟠 Estandarización del código a inglés](#estandarización-del-código-a-inglés---costo-creciente)
- [Deuda pendiente](#deuda-pendiente)
  - [🟠 Altas](#-altas)
    - [DT-02 · Faltan los casos de prueba de las historias ya implementadas (backend)](#dt-02--faltan-los-casos-de-prueba-de-las-historias-ya-implementadas-backend)
    - [DT-01 · Cobertura de testing frontend](#dt-01--cobertura-de-testing-frontend)
    - [DT-05 · Falta activar/desactivar la cuota deportiva](#dt-05--falta-activardesactivar-la-cuota-deportiva)
    - [DT-27 · Documentación por disciplina: requisitos, estados y vigencia](#dt-27--documentación-por-disciplina-requisitos-estados-y-vigencia)
    - [DT-29 · No existe solicitud de inscripción con aprobación](#dt-29--no-existe-solicitud-de-inscripción-con-aprobación)
    - [DT-31 · No existe compra real de entradas](#dt-31--no-existe-compra-real-de-entradas)
    - [DT-35 · El pago implementado solo cubre la cuota social](#dt-35--el-pago-implementado-solo-cubre-la-cuota-social)
  - [🟡 Medias](#-medias)
    - [DT-11 · La pantalla de Inscripción no muestra a los inscriptos](#dt-11--la-pantalla-de-inscripción-no-muestra-a-los-inscriptos)
    - [DT-10 · La pantalla de Auditoría es interminable](#dt-10--la-pantalla-de-auditoría-es-interminable)
    - [DT-24 · La planilla documenta generación de cuotas que no existe](#dt-24--la-planilla-documenta-generación-de-cuotas-que-no-existe)
    - [DT-25 · La auditoría append-only no está garantizada por la base](#dt-25--la-auditoría-append-only-no-está-garantizada-por-la-base)
    - [DT-22 · La rotación mensual de la cuota social no tiene quién la dispare](#dt-22--la-rotación-mensual-de-la-cuota-social-no-tiene-quién-la-dispare)
    - [DT-23 · El ratchet de cobertura corta el CI por décimas](#dt-23--el-ratchet-de-cobertura-corta-el-ci-por-décimas)
    - [DT-26 · La documentación de la API no declara respuestas](#dt-26--la-documentación-de-la-api-no-declara-respuestas)
    - [DT-17 · Código muerto: `EditarInscripcionPage`](#dt-17--código-muerto-editarinscripcionpage)
    - [DT-28 · El participante no puede consultar su propia documentación](#dt-28--el-participante-no-puede-consultar-su-propia-documentación)
    - [DT-32 · Los eventos no tienen fecha ni horario](#dt-32--los-eventos-no-tienen-fecha-ni-horario)
    - [DT-33 · Las entradas no pueden expirar correctamente](#dt-33--las-entradas-no-pueden-expirar-correctamente)
    - [DT-34 · No hay cancelación, devolución ni transferencia de entradas](#dt-34--no-hay-cancelación-devolución-ni-transferencia-de-entradas)
  - [⚪ Bajas](#-bajas)
    - [DT-08 · Las entradas con QR no se pueden descargar en PDF](#dt-08--las-entradas-con-qr-no-se-pueden-descargar-en-pdf)
    - [DT-09 · Imágenes en eventos](#dt-09--imágenes-en-eventos)
    - [DT-20 · La edición de socio y de cuota social sigue en página aparte](#dt-20--la-edición-de-socio-y-de-cuota-social-sigue-en-página-aparte)
    - [DT-06 · Historias de usuario para sumar al backlog](#dt-06--historias-de-usuario-para-sumar-al-backlog)
    - [DT-36 · No hay notificaciones de vencimiento o resolución](#dt-36--no-hay-notificaciones-de-vencimiento-o-resolución)
- [Deuda resuelta](#deuda-resuelta)
- [Trazabilidad de casos de prueba](#trazabilidad-de-casos-de-prueba)
- [Nomenclatura](#nomenclatura)
- [Definition of Done aplicada a la deuda técnica](#definition-of-done-aplicada-a-la-deuda-técnica)

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
| 🧭 Decisiones del equipo | [DT-15](#persistencia-de-los-adjuntos-en-azure-dt-15---riesgo-activo), [migración a inglés](#estandarización-del-código-a-inglés---costo-creciente) |
| ✅ Resueltas | DT-03, DT-04, DT-07, DT-13, DT-14, DT-16, DT-18, DT-19, DT-21, DT-30 |
| 🟠 Altas pendientes | DT-01, DT-02 (en curso), DT-05, DT-27, DT-29, DT-31, DT-35 |
| 🟡 Medias pendientes | DT-10, DT-11, DT-17, DT-22, DT-23, DT-24, DT-25, DT-26, DT-28, DT-30, DT-32, DT-33, DT-34 |
| ⚪ Bajas pendientes | DT-06, DT-08, DT-09, DT-20, DT-36 |

**Cobertura de tests** (medida el 16/09/2026, objetivo DoD **70 %**):

| Repo | Statements | Piso configurado |
|---|---|---|
| Frontend (Vitest) | 22,03 % | 22 % |
| Backend (Jest) | **60,82 %** | 58 % |

Los dos repos tenían además el **CI en rojo** por configuración de lint, no por
código: ver [Extra](#extra--ci-del-frontend-en-rojo-desde-el-0709) al final.

El piso ("ratchet") solo puede subir: cada PR que agrega tests lo sube, y así
la cobertura no puede retroceder. **Se deja ~3 puntos de margen sobre el valor
real a propósito**: con el piso pegado al número exacto, el CI del equipo se
cortó por 0,15 puntos por un PR que no había hecho nada mal (ver DT-23), y eso
solo genera la tentación de bajar el umbral a mano.

---

## Decisiones pendientes del equipo

Esto **no es trabajo pendiente: son decisiones**. Están acá porque ya las
conocemos y el costo de no decidir crece con el tiempo. No se pueden atacar
como deuda técnica hasta que el equipo elija un camino.

### Persistencia de los adjuntos en Azure (DT-15) · 🔴 riesgo activo

La documentación obligatoria (US-24) guarda el binario en el filesystem del
contenedor (`DOCS_STORAGE_DIR=storage/documentacion`). En Azure Container Apps
ese filesystem es **efímero**: cada revisión, reinicio o escalado borra los
archivos y la base queda con referencias a rutas que ya no existen.
**Ya está desplegado así**, así que el riesgo corre desde hoy.

| Opción | A favor | En contra |
|---|---|---|
| **Azure Blob Storage** | No ata el despliegue a un volumen; escala y se respalda solo | Hay que escribir el adaptador y sumar el SDK |
| **Azure File Share montado** | El código actual queda casi intacto | Acopla la infra al Container App; hay que gestionar el montaje en cada entorno |

- **Evidencia:** `src/documentacion/storage.config.ts:17` · `.github/workflows/cd-main.yml` (no monta ningún volumen)
- **Además hay que decidir** qué hacer con los registros que ya apuntan a rutas inexistentes en el entorno de pruebas.
- **Bloquea:** DT-09 (imágenes en eventos). Si se hace antes, repite el mismo bug.
- **Rama sugerida una vez decidido:** `issue/TASK-13-DT-15-Persistencia-adjuntos-azure`

### Estandarización del código a inglés · 🟠 costo creciente

La rama `refactor/standardize-english` existe en los **dos remotos** y toca
identificadores en todo el código (variables, tablas, endpoints, seeds). Hoy
el estándar vigente es **español**, y así lo dice el `CLAUDE.md` de los dos
repos.

El problema es que **cada rama que se mergea a `dev` le suma conflictos**. No
decidir tiene un costo que sube solo.

| Opción | A favor | En contra |
|---|---|---|
| **Descartarla** | Cierra el tema; el español queda como estándar definitivo | Se pierde el trabajo ya hecho en esa rama |
| **Rebasear y mergear pronto** | Aprovecha el trabajo y corta la sangría de conflictos | Es un cambio enorme en un solo PR, difícil de revisar y de testear |
| **Congelarla con fecha** | Permite terminar el sprint sin ruido | Los conflictos siguen creciendo hasta esa fecha |

> **Ojo con el alcance:** la estandarización es de **código** (identificadores,
> tablas, endpoints). Los textos de usuario y los datos de dominio
> (categorías, disciplinas, mensajes de error) van en español igual.

---

## Deuda pendiente

### 🟠 Altas

#### DT-02 · Faltan los casos de prueba de las historias ya implementadas (backend)
*backend · en curso*

Esto **no es «falta cobertura»**: de las **22 US implementadas en el backend,
solo 5 tienen casos cargados** en la planilla (US-07, US-08, US-38, US-39,
US-40). Las otras se mergearon sin documentar un solo caso, y la cobertura baja
es la consecuencia, no la causa.

Por eso se ataca **por historia y no por módulo**: se generan los casos con
`/casos-prueba`, se automatizan con `/casos-a-tests` y la cobertura sube como
efecto. Así los tests cubren requisitos y quedan trazables US → TC → test, que
es lo que pide la DoD y lo que se entrega.

| US implementada | Módulo | Cobertura | Casos |
|---|---|---|---|
| ~~US-16 Configurar cuota social~~ | `cuota-social` | **90 %** | ✅ 10 casos |
| ~~US-32 Registrar logs de operaciones~~ | `auditoria` | **92 %** | ✅ 9 casos |
| US-24 Documentación obligatoria | `documentacion` | 41 % | pendiente |
| US-30 / US-31 Entradas y QR | `entradas` | 50 % | pendiente |
| US-29 Crear evento | `eventos` | 51 % | pendiente |
| US-09/11/12/13/14/15 Socios | `socios` | 54 % | pendiente |
| US-20 Configurar cuotas deportivas | `cuotas` | 56 % | pendiente |
| US-01 / US-02 / US-03 Usuarios | `usuarios` | 61 % | pendiente |
| US-05 / US-06 Participantes | `inscripcion` | 75 % | pendiente |
| — | `categorias` | 0 % | sin US asociada |

- **Orden sugerido para lo que queda:** US-01/02/03 (permisos), US-20, US-29/30/31, US-24, socios.
- **Rama sugerida:** `issue/TASK-<n>-DT-02-Casos-<US>`

#### DT-01 · Cobertura de testing frontend
*frontend · 8 SP*

De 22 % a 70 % no se llega en una rama. Conviene repartir por feature — una
rama por dominio sin tests (`auditoria`, `entradas`, `documentacion`,
`disciplinas`, `dashboard`) — y subir el piso en cada PR. **Regla de equipo:
ninguna rama de deuda técnica se mergea sin sus propios tests**; así DT-01
avanza sola con el resto del trabajo.

- **Rama sugerida:** `issue/TASK-<n>-DT-01-Cobertura-frontend-<feature>`

#### DT-05 · Falta activar/desactivar la cuota deportiva
*frontend · 1 SP*

El backend ya está listo: `ConfiguracionCuotaDeportiva.activo` existe,
`ActualizarCuotaDto` acepta `activo`, el service lo persiste y audita, el tipo
del front lo declara y la tabla ya muestra el badge Activo/Inactivo. **Falta
solo el botón** que mande `{ activo: false }`.

- **Evidencia:** `actualizar-cuota.dto.ts:14` · `cuotas.service.ts` (`actualizar`) · `CuotasTable.tsx`
- **Rama sugerida:** `issue/TASK-16-DT-05-Activar-desactivar-cuota-deportiva`

#### DT-27 · Documentación por disciplina: requisitos, estados y vigencia
*Nuevo · funcional · backend + frontend*

La primera parte de esta deuda quedó resuelta: `Disciplina` ahora tiene
`solicitaDocumentacion`, `plazoDiasDocumentacion` y una relación con tipos de
documentación requeridos, administrables desde el ABM. Siguen pendientes los
estados, la vigencia y la validación contra la inscripción. `Documentacion`
todavía solo se relaciona con `Persona`:

- **La inscripción no valida todavía la configuración.** Aunque ya existe
  `Disciplina.solicitaDocumentacion` y la tabla de requisitos por disciplina
  (apto físico, autorización, DNI, etc.), aún falta exigir documentación
  aprobada y vigente al inscribir.
- **No tiene estado.** Solo guarda fechas y archivo: no hay forma de saber si
  un documento fue aprobado, rechazado o sigue pendiente. Faltan `estado`
  (`PENDIENTE`, `APROBADA`, `RECHAZADA`, `VENCIDA`), `revisadoPor`,
  `revisadoEn` y `motivoRechazo`, además de acciones para aprobar, rechazar
  con motivo, marcar vencida automáticamente y reemplazar un documento
  conservando el historial.
- **No hay noción de vigencia ni de documento activo.** Si una persona
  reemplaza, por ejemplo, un apto físico, el sistema conserva varias versiones
  pero no indica cuál es la vigente para cada disciplina. Falta definir
  documento activo, reemplazo, historial de versiones, vigencia por
  disciplina y prioridad del documento aprobado más reciente.
- **La inscripción no sabe qué documentación pedir.** Al inscribir (o al
  solicitar la inscripción, ver DT-29) hay que poder especificar, según la
  disciplina elegida, qué tipo(s) de documentación corresponde exigir, y
  bloquear o dejar pendiente la inscripción si falta o está vencida.

**Arreglo pendiente:** agregar estado y trazabilidad en `Documentacion`, y la
validación correspondiente al crear/activar una inscripción: si la disciplina
no exige documentación se permite; si la exige, debe existir documentación
aprobada y vigente del tipo pedido, y si falta o está vencida la inscripción
(o la solicitud) queda pendiente o se rechaza. Depende de que exista un ABM de
disciplina real (DT-30) para poder configurar estos requisitos.

- **Configuración de requisitos resuelta en US-XX (22/09/2026).**
- **Pendiente:** estados/vigencia de `Documentacion`, validación de inscripción
  y job automático de baja por vencimiento del plazo.
- **Rama sugerida:** `issue/TASK-19-DT-27-Documentacion-por-disciplina`

#### DT-29 · No existe solicitud de inscripción con aprobación
*Nuevo · funcional · backend + frontend*

La inscripción se crea directamente con `POST /inscripcion`, habilitado solo
para `ADMIN` y `DELEGADO`. No existe una solicitud pendiente que el
participante pueda iniciar y que alguien con permisos revise: hoy no hay
forma de que un socio pida inscribirse a una disciplina, ni de aprobar o
rechazar ese pedido antes de que la inscripción exista.

**Arreglo:** crear una entidad `SolicitudInscripcion` (`personaId`,
`disciplinaId`, `categoriaDisciplinaId`, `estado`: `PENDIENTE`, `APROBADA`,
`RECHAZADA`, `CANCELADA`, fechas de solicitud y resolución, usuario que
resolvió, motivo de rechazo). Flujo: el usuario solicita inscribirse → se
valida documentación y condiciones (DT-27) → el colaborador o delegado
aprueba o rechaza → solo al aprobar se crea o activa la `Inscripcion`.

- **Detectado en el análisis funcional de dominio (22/09/2026).**
- **Rama sugerida:** `issue/TASK-20-DT-29-Solicitud-de-inscripcion`

#### DT-31 · No existe compra real de entradas
*Nuevo · funcional · backend + frontend*

`crearMultiples()` genera entradas administrativas: no registra comprador,
usuario o persona propietaria, precio, pago, orden de compra ni estado de
compra. El botón "Comprar entradas" hoy en realidad significa "generar
entradas": no hay pago de por medio.

**Arreglo:** crear `CompraEntrada` y `DetalleCompraEntrada`, sumar
`Entrada.usuarioId` (o `personaId`) y un `estadoCompra` (`PENDIENTE`,
`PAGADA`, `CANCELADA`, `REEMBOLSADA`). Flujo: el usuario elige evento y
cantidad → se crea una compra pendiente → se procesa el pago → las entradas
se generan solo si el pago fue aprobado → quedan asociadas al comprador.

- **Detectado en el análisis funcional de dominio (22/09/2026).**
- **Rama sugerida:** `issue/TASK-21-DT-31-Compra-real-de-entradas`

#### DT-35 · El pago implementado solo cubre la cuota social
*Nuevo · funcional · backend*

`PagosService` calcula únicamente cuotas sociales. Un participante puede
estar inscripto en una disciplina con cuota deportiva y el sistema nunca le
genera ni le cobra esa deuda. Es la contracara de DT-24/DT-06 (que ya
registran que la cuota deportiva no se emite): además de no generarse, hoy
tampoco hay ningún camino de cobro para ella.

**Arreglo:** unificar el concepto de obligación de pago, o crear cuotas
separadas y cobrables para cuota social, cuota deportiva, matrícula y
eventos.

- **Relacionado:** [DT-24](#dt-24--la-planilla-documenta-generación-de-cuotas-que-no-existe), [DT-06](#dt-06--historias-de-usuario-para-sumar-al-backlog).
- **Detectado en el análisis funcional de dominio (22/09/2026).**
- **Rama sugerida:** `issue/TASK-22-DT-35-Cobro-de-cuota-deportiva`

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

#### DT-24 · La planilla documenta generación de cuotas que no existe
*Nuevo · producto + documentación · a definir*

Cuatro casos de US-05 (`TC-017` a `TC-020`) esperan que al inscribir un
participante **«se generan automáticamente las cuotas correspondientes»**. Eso
no está implementado ni modelado:

- El dominio solo tiene `ConfiguracionCuotaDeportiva` y `ConfiguracionCuotaSocial`, que son **el monto configurado**, no cuotas emitidas. No existe ninguna entidad de cuota generada ni deuda por socio.
- `inscripcion.service.ts` no toca cuotas en ningún momento; el propio código lo admite en un comentario (`inscripcion.service.ts:399`: «generación de cuotas asociadas (que hoy no existe en el dominio…)»).

O sea: esos cuatro casos **no pueden ejecutarse como están escritos**. Hay que
decidir si se implementa la generación (es producto nuevo, se vincula con
DT-06) o si se corrigen los casos para que describan lo que el sistema hace.

- **Detectado al contrastar la planilla contra el código.**
- **Confirmado además en el análisis funcional de dominio (22/09/2026):**
  las configuraciones de precio deportivo existen, pero no se emite ninguna
  cuota real por persona/inscripción. Ver también
  [DT-35](#dt-35--el-pago-implementado-solo-cubre-la-cuota-social) (el pago
  tampoco cubre esa cuota una vez que exista) y
  [DT-06](#dt-06--historias-de-usuario-para-sumar-al-backlog).

#### DT-25 · La auditoría append-only no está garantizada por la base
*Nuevo · backend · 2 SP*

`TC-024` (US-07) y `TC-074` (US-32) esperan que un UPDATE o DELETE sobre
`registros_auditoria` sea **«rechazado a nivel de servicio/base de datos (tabla
append-only)»**. La mitad del servicio ahora está cubierta y es cierta
(`AuditoriaService` solo expone `registrar`, `listarPorEntidad` y
`listarTodos`, y hay un test que falla si alguien agrega otro método de
escritura). **La mitad de la base de datos no:** no hay trigger, ni `REVOKE`,
ni regla en ninguna migración. Nada impide que otro código —o alguien con la
credencial— haga `UPDATE` o `DELETE`.

- **Evidencia:** ninguna migración contiene `TRIGGER`, `REVOKE`, `GRANT` ni `RULE`; el único respaldo es el comentario del `schema.prisma`.
- **Arreglo:** o se agrega la restricción real en la base (trigger que rechace UPDATE/DELETE, o un rol de aplicación sin esos permisos sobre la tabla), o se corrige el texto de los dos casos para que describan solo la garantía a nivel de servicio.
- **RNF03 / RF12 dependen de esto**, así que conviene no dejarlo como comentario.

#### DT-22 · La rotación mensual de la cuota social no tiene quién la dispare
*Nuevo · backend · 2 SP*

`CuotaSocialService.sincronizarVigentes` dice en su comentario «se ejecuta el
día 1 de cada mes», pero **nada lo ejecuta**: no hay `@nestjs/schedule`, ni
cron, ni disparador externo documentado. El único camino es que alguien llame a
mano a `POST /cuota-social/sincronizar`.

Consecuencia: el flag `activo` de las configuraciones queda desfasado de la
vigencia por fecha hasta que alguien se acuerde. Las consultas por fecha
(`getVigente`) sí funcionan bien, así que el impacto está acotado a lo que
dependa del flag.

- **Evidencia:** `src/cuota-social/cuota-social.service.ts:205`
- **Arreglo:** sumar `@nestjs/schedule` con un cron mensual, o un job externo que llame al endpoint. Ojo con las réplicas: si el Container App escala, el cron corre en todas.
- **Detectado al escribir los casos de US-16.**

#### DT-23 · El ratchet de cobertura corta el CI por décimas
*Nuevo · tooling · resuelto por ahora, dejar anotado*

Al cerrar DT-16 el piso de ramas quedó en 58 % y un PR del equipo (US-07) lo
dejó en 57,85 %: **el CI de `dev` quedó en rojo por 0,15 puntos** sin que nadie
hiciera nada mal. Se resolvió dejando ~3 puntos de margen, pero conviene
revisarlo si vuelve a pasar. La alternativa de fondo es exigir tests por PR
(regla de equipo) en lugar de apretar el número global.

#### DT-26 · La documentación de la API no declara respuestas
*Nuevo · backend · 3 SP*

Swagger está bien montado y al día en lo estructural: **56 de 56 operaciones
tienen `summary`** (la única excepción es `GET /health`), los 14 tags están
completos y los 22 DTO de request generan su schema. El problema está del lado
de las respuestas:

- **Ninguna de las 56 operaciones declara un solo código de error.** El spec
  solo trae el `200`/`201` que Nest infiere, así que en la UI no figura que
  `POST /cuota-social` puede responder 400 por período inválido, 403 sin rol
  ADMIN o 404 si la categoría no existe. Toda esa información existe y está
  verificada (son los casos `TC-091` a `TC-107`), pero no llega al contrato.
- **Ninguna declara el tipo de su respuesta** (`0 de 56` tienen `content`), así
  que el spec no dice qué forma tiene lo que devuelve. Las descripciones
  también están vacías (`"description": ""`).

Consecuencia práctica: el frontend no puede generar tipos ni clientes desde el
spec, y quien consume la API tiene que leer el código para saber qué esperar.
Para un proyecto donde Swagger es el entregable de documentación técnica, el
contrato queda a medias.

- **Evidencia:** `GET /api/v1/docs-json` — todas las operaciones con `responses: {"20x": {"description": ""}}`.
- **Arreglo:** `@ApiResponse` (o los atajos `@ApiOkResponse`, `@ApiBadRequestResponse`, `@ApiForbiddenResponse`, `@ApiNotFoundResponse`) por operación, y DTOs de respuesta para los tipos de retorno. Conviene hacerlo **módulo por módulo, apoyándose en los casos de prueba ya documentados**: los códigos y mensajes reales ya están relevados ahí, así que no hay que investigarlos de nuevo.
- **Empezar por** `auth`, `usuarios` e `inscripcion`, que son los que el frontend consume más y los que tienen reglas de permisos.
- **Detectado al revisar Swagger sobre la instancia local.**
- **Rama sugerida:** `issue/TASK-<n>-DT-26-Documentar-respuestas-api`

#### DT-17 · Código muerto: `EditarInscripcionPage`
*Nuevo · frontend · incluido en DT-11*

El archivo existe (196 líneas) y no está importado en ningún lado — no tiene
ruta en `AppRouter`. Al hacer DT-11: o se conecta al listado nuevo, o se borra.

#### DT-28 · El participante no puede consultar su propia documentación
*Nuevo · funcional · backend + frontend*

El endpoint de documentación solo permite acceso a `ADMIN` y `DELEGADO`, y la
pantalla de edición del participante no carga documentación. El propio socio
no puede ver qué documentos tiene cargados, ni su estado o vencimiento.

**Arreglo:** incluir documentación en el detalle del participante; permitir
que el propio usuario consulte la documentación de su persona; permitir que
`COLABORADOR` la consulte si va a ser responsable de revisar solicitudes
(ver DT-27/DT-29); mostrar estado, vencimiento, tipo y archivo.

- **Detectado en el análisis funcional de dominio (22/09/2026).**
- **Rama sugerida:** `issue/TASK-23-DT-28-Consulta-documentacion-participante`

#### DT-32 · Los eventos no tienen fecha ni horario
*Nuevo · funcional · backend + frontend*

`Evento` solo tiene nombre, descripción y cantidad de entradas. No se puede
saber cuándo ocurre, si ya pasó, ni cuándo empieza o termina la venta de
entradas.

**Arreglo:** agregar `fechaInicio`, `fechaFin`, `inicioVenta`, `finVenta`,
ubicación y estado del evento.

- **Relacionado:** [DT-09](#dt-09--imágenes-en-eventos) (mismo módulo de eventos).
- **Detectado en el análisis funcional de dominio (22/09/2026).**
- **Rama sugerida:** `issue/TASK-25-DT-32-Fecha-y-horario-de-eventos`

#### DT-33 · Las entradas no pueden expirar correctamente
*Nuevo · funcional · backend*

Existe el estado `EXPIRADA`, pero `Entrada` no tiene fecha de vencimiento y
el servicio nunca las expira automáticamente.

**Arreglo:** derivar el vencimiento desde el evento (DT-32) o guardar
`fechaVencimiento` en la propia entrada; rechazar compras fuera del período
de venta; correr un proceso que marque entradas vencidas.

- **Depende de:** [DT-32](#dt-32--los-eventos-no-tienen-fecha-ni-horario).
- **Detectado en el análisis funcional de dominio (22/09/2026).**
- **Rama sugerida:** `issue/TASK-26-DT-33-Expiracion-de-entradas`

#### DT-34 · No hay cancelación, devolución ni transferencia de entradas
*Nuevo · funcional · backend + frontend*

Una entrada solo puede estar `VALIDA`, `USADA` o `EXPIRADA`. Faltan estados
como `CANCELADA`, `REEMBOLSADA` y `TRANSFERIDA`, lo que impide resolver
errores de compra, devoluciones o cambios de titularidad.

**Arreglo:** sumar esos estados al ciclo de vida de `Entrada` y las acciones
para pasar por ellos, apoyándose en la compra real (DT-31) para saber a
quién reembolsar.

- **Depende de:** [DT-31](#dt-31--no-existe-compra-real-de-entradas).
- **Detectado en el análisis funcional de dominio (22/09/2026).**
- **Rama sugerida:** `issue/TASK-27-DT-34-Cancelacion-devolucion-transferencia-entradas`

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

No es deuda de código: son historias de producto nuevas.

- US-X: Darme de baja como socio.
- US-Y: Reactivación / nueva alta de un ex-socio.
- US-Z: Baja automática por falta de pago.
- US-W: **Generación de cuotas** (social y deportiva) por período.

**Baja automática implica un job programado y reglas de morosidad que hoy no
existen en el dominio.** Estimarlas en refinamiento y sacarlas de esta tabla.

**US-W es además una dependencia de US-07.** El criterio de aceptación «el
sistema detiene la generación de nuevas cuotas asociadas a ese participante» no
tiene hoy dónde implementarse: no existe ninguna entidad de cuota por persona.
`ConfiguracionCuotaSocial` y `ConfiguracionCuotaDeportiva` son **precios**
(monto por categoría/disciplina y período), no cuotas emitidas, y no hay ningún
proceso de emisión (`generar*`), ni modelo `Pago`. Lo que sí dejó la baja de
US-07 es la precondición correcta: el participante queda Inactivo
(`Persona.activo = false`) y **sin inscripciones vigentes**, que es lo que
tendrá que filtrar el generador cuando exista.

#### DT-36 · No hay notificaciones de vencimiento o resolución
*Nuevo · funcional · backend + frontend*

El usuario no recibe avisos cuando: su documentación está por vencer; una
solicitud (DT-29) fue aprobada o rechazada; una compra (DT-31) fue
confirmada; o una cuota está vencida.

**Arreglo:** agregar notificaciones internas y, opcionalmente, email.

- **Detectado en el análisis funcional de dominio (22/09/2026).**
- **Rama sugerida:** `issue/TASK-28-DT-36-Notificaciones`

---

## Deuda resuelta

### DT-30 · ABM de disciplina
**US-XX** · 22/09/2026

Se implementó el ABM completo de disciplinas en backend y frontend: listado
para ADMIN/COLABORADOR, alta, edición, baja lógica, reactivación y auditoría
de mutaciones. La pantalla incluye búsqueda, filtros por estado, confirmación
de acciones y feedback con toasts.

También se incorporó la configuración de requisitos documentales por
disciplina mediante un catálogo enum cerrado, con plazo de tolerancia
individual por tipo, y restricciones opcionales por edad y género.
El listado administrativo resuelve búsqueda, filtro de estado y paginación en
el backend; las pestañas muestran los conteos de todos, activos e inactivos
según la búsqueda vigente. El formulario permite definir el estado inicial o
actualizarlo.
Las mutaciones siguen protegidas para ADMIN, mientras COLABORADOR conserva
acceso de consulta.

- Enum Prisma: `GeneroDisciplina` con `FEMENINO`, `MASCULINO` y
  `NO_BINARIO_NO_ESPECIFICADO` (UI: «No binario / No especificado»).
- Tests: servicio backend (14 casos) y schema Zod frontend (3 casos).
- El job automático de baja por vencimiento queda fuera de esta US y continúa
  registrado en DT-27.

### DT-18 · Numeración única y secuencial de los casos de prueba
**PR [#39](https://github.com/lucasgazzola/socialclub-backend/pull/39)** ·
**PR frontend [#68](https://github.com/lucasgazzola/socialclub-frontend/pull/68)** ·
`issue/TASK-15-DT-18-Renumerar-casos-de-prueba` · 16/09/2026

La planilla tenía **90 filas con 83 IDs**: `TC-006` a `TC-012` existían dos
veces (US-02 y US-03 / US-05), porque cada quien numeró su bloque arrancando
de `TC-001`. Encima, `docs/exportables/casos-prueba.csv` era una tercera
numeración, así que cualquier script que tomara el próximo ID de ahí pisaba
filas existentes.

El equipo adoptó **secuencial único + `/exportar-casos` como único asignador**
(se descartó el prefijo `TC-US02-01` para no romper el formato `TC-XXX` de la
cátedra). En el orden de la planilla:

| US | Antes | Ahora |
|---|---|---|
| US-01, US-02 | `TC-001`..`TC-012` | sin cambios |
| US-03 | `TC-006`..`TC-009` | `TC-013`..`TC-016` |
| US-05 | `TC-010`..`TC-013` | `TC-017`..`TC-020` |
| … | cada bloque posterior se desplazó | hasta `TC-090` |

- Planilla local (`.xlsx`, gitignored): 90 IDs únicos, `TC-001` a `TC-090`. Las 27 ejecuciones ya cargadas se remapearon con la US que declaraban, así que las 7 que apuntaban a un ID ambiguo (todas US-02) no cambiaron.
- `docs/exportables/casos-prueba.csv` pasó a ser el dump de esa planilla, no una fuente paralela. El mapa viejo→nuevo está en `docs/exportables/mapeo-DT-18.csv`.
- Los 17 casos de US-16/US-32 que estaban listos para pegar (`TC-084`..`TC-100`) pasaron a `TC-091`..`TC-107` para no chocar con los IDs nuevos de US-38/39/40.
- Los specs que etiquetaban `TC-xxx` se remapearon **por US** (auth/US-38, socios/US-12). Los de usuarios (US-02) no se tocaron: esos IDs no cambian. Los `TC-0701` / `TC-0801` de inscripción son otro esquema y se dejaron.
- `scripts/exportar-casos.mjs` + `scripts/ids-planilla.py` leen el máximo del `.xlsx` y de `docs/exportables/*.csv`, y se niegan a asignar si vuelven a aparecer duplicados. El próximo ID libre es **`TC-108`**.

La copia de Drive se actualiza pegando `docs/exportables/casos-prueba-para-pegar.tsv`
(no el CSV). El `.xlsx` del repo es local y gitignored.

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


## Trazabilidad de casos de prueba

La fuente de verdad es la planilla
`docs/documentacion/desarrollo-del-producto/01 ... Plan de testing del producto ... .xlsx`
(hojas *Casos de Prueba*, *Ejecución de Pruebas*, *Defectos*, *Conformidad PO*,
*Resumen*). `docs/exportables/` versiona ese contenido en git; no reemplaza a la planilla.

Estado al 16/09/2026, contrastado contra el código (IDs **después de DT-18**):

| | Cantidad |
|---|---|
| Casos en el dump | **107 IDs únicos** (`TC-001` a `TC-107`) |
| US con casos documentados | 18 (las 16 de la planilla original + US-16 y US-32) |
| US implementadas en el backend | 22 (+ US-16, que no estaba etiquetada) |
| **US implementadas sin ningún caso** | **US-06, US-08, US-09, US-11, US-24, US-31** |
| Ejecuciones en el dump | 46 (`EJ-01` a `EJ-46`) |

Archivos:

- `docs/exportables/casos-prueba.csv` — dump de **Casos de Prueba** (saltos reales; lo usa `/exportar-casos`)
- `docs/exportables/ejecucion.csv` — dump de **Ejecución de Pruebas**
- `docs/exportables/casos-prueba-para-pegar.tsv` / `ejecucion-para-pegar.tsv` — pegar en Drive desde **A2** (`Pasos`/`Evidencia` unidos con ` / `)
- `docs/exportables/mapeo-DT-18.csv` — histórico viejo → nuevo; no se pega

No pegar los CSV en Sheets: las celdas multilínea parten filas.

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
  integrante y enlazado a la tarjeta de GitHub Projects. Al crearlo:
  `gh pr create --base dev` — la default de GitHub en este repo es `main`,
  no `dev`. Un PR sin `--base` va a producción.

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
