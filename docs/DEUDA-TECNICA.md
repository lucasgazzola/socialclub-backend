# Deuda técnica — SocialClub

Registro vivo de la deuda técnica del producto: qué hay, en qué orden conviene
atacarla, qué se resolvió y cómo. Cubre los dos repos (`socialclub-backend` y
`socialclub-frontend`).

- **Equipo:** Nullpointer
- **Última actualización:** 04/10/2026 (TASK-39 a TASK-42: DT-42, DT-25, DT-41 y DT-26)
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
    - [DT-27 · Documentación por disciplina: requisitos, estados y vigencia](#dt-27--documentación-por-disciplina-requisitos-estados-y-vigencia)
    - [DT-29 · No existe solicitud de inscripción con aprobación](#dt-29--no-existe-solicitud-de-inscripción-con-aprobación)
    - [DT-31 · No existe compra real de entradas](#dt-31--no-existe-compra-real-de-entradas)
    - [DT-35 · El pago implementado solo cubre la cuota social](#dt-35--el-pago-implementado-solo-cubre-la-cuota-social)
  - [🟡 Medias](#-medias)
    - [DT-43 · El DNI no debe requerir fecha de vencimiento](#dt-43--el-dni-no-debe-requerir-fecha-de-vencimiento)
    - [DT-44 · Las fechas guardadas a las 00:00 UTC corren la deuda deportiva un mes](#dt-44--las-fechas-guardadas-a-las-0000-utc-corren-la-deuda-deportiva-un-mes)
    - [DT-10 · La pantalla de Auditoría es interminable](#dt-10--la-pantalla-de-auditoría-es-interminable)
    - [DT-24 · La planilla documenta generación de cuotas que no existe](#dt-24--la-planilla-documenta-generación-de-cuotas-que-no-existe)
    - [DT-23 · El ratchet de cobertura corta el CI por décimas](#dt-23--el-ratchet-de-cobertura-corta-el-ci-por-décimas)
    - [DT-28 · El participante no puede consultar su propia documentación](#dt-28--el-participante-no-puede-consultar-su-propia-documentación)
    - [DT-34 · No hay cancelación, devolución ni transferencia de entradas](#dt-34--no-hay-cancelación-devolución-ni-transferencia-de-entradas)
  - [⚪ Bajas](#-bajas)
    - [DT-08 · Las entradas con QR no se pueden descargar en PDF](#dt-08--las-entradas-con-qr-no-se-pueden-descargar-en-pdf)
    - [DT-09 · Imágenes en eventos](#dt-09--imágenes-en-eventos)
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
| ✅ Resueltas | DT-01, DT-03, DT-04, DT-05, DT-07, DT-11, DT-13, DT-14, DT-16, DT-17, DT-18, DT-19, DT-20, DT-21, DT-22, DT-25, DT-26, DT-30, DT-32, DT-33, DT-37, DT-38, DT-39, DT-40, DT-41, DT-42 |
| 🟠 Altas pendientes | DT-02 (en curso), DT-27 (configuración, estado documental y alertas resueltos; restan aprobación/rechazo y habilitación excepcional), DT-29, DT-31, DT-35 (cobro y tarifa resueltos; resta autoservicio) |
| 🟡 Medias pendientes | DT-10, DT-23, DT-24, DT-28, DT-34, DT-43, DT-44 |
| ⚪ Bajas pendientes | DT-06, DT-08, DT-09, DT-36 (servicio de notificaciones resuelto en TASK-35; restan los avisos de DT-29, DT-31 y cuotas) |

**Cobertura de tests** (medida el 02/10/2026, objetivo DoD **70 %**):

| Repo | Statements | Piso configurado |
|---|---|---|
| Frontend (Vitest) | **70,13 %** ✅ | 67 % |
| Backend (Jest) | **76,8 %** ✅ | 70 % |

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

- **Configuración de requisitos resuelta en US-44 (22/09/2026).**
- **Requisitos por categoría resueltos en US-48/49 (01/10/2026,**
  backend [#64](https://github.com/lucasgazzola/socialclub-backend/pull/64) ·
  frontend [#89](https://github.com/lucasgazzola/socialclub-frontend/pull/89)**):**
  `DisciplinaRequerimientoDoc.categoriaDisciplinaId` (null = de toda la
  disciplina; con valor = adicional de la categoría). Cada requisito guarda
  desde cuándo rige (`creadoEn`), base del plazo para los ya inscriptos.
- **Base de datos lista para lo que sigue:** `Documentacion.tipoDocumento`
  (catálogo; los documentos viejos con texto libre se mapearon cuando
  coincidían y el resto quedó en null), `Inscripcion.requisitosDesde` (US-6) y
  la tabla `habilitaciones_excepcionales` (US-28).
- **Estado documental resuelto en US-25 / TASK-31 (01/10/2026 - 05/10/2026):**
  `EstadoDocumentalService` calcula en el momento, por cada inscripción activa,
  el estado de cada documento exigido (Vigente / Por vencer / Vencido / Faltante
  con fecha límite) y el estado general (Habilitado / Pendiente de documentación
  / Bloqueado), con los motivos en texto. Cubierto por casos `TC-180` a `TC-185` y
  ejecuciones `EJ-121` a `EJ-126`. Al ser un cálculo, el bloqueo por
  vencimiento (US-27) no necesita jobs. Lo usan: el alta de inscripción
  (`GET /inscripcion/requisitos` y la respuesta del alta), el listado de
  participantes y `GET /documentacion/persona/:id/estado`. La documentación se
  carga con un tipo del catálogo, solo entre los exigidos al participante; un
  documento nuevo del mismo tipo renueva al anterior.
- **Bloqueo por documentación resuelto en US-27 (05/10/2026):**
  Cubierto por casos `TC-186` a `TC-190` y ejecuciones `EJ-127` a `EJ-131`. El sistema bloquea automáticamente
  el día en que vence el documento o al cumplirse el plazo de tolerancia sin entrega, aísla el bloqueo a la disciplina/categoría
  afectada sin impactar en las restantes, expone los motivos detallados en sistema y UI, y levanta automáticamente por renovación vigente
  o manualmente por habilitación excepcional.
- **Alertas resueltas en US-26 (03/10/2026):** ver [Resuelta](#us-26--alertas-por-vencimiento-de-documentación-con-aviso-por-email).
- **Pendiente:** aprobación/rechazo de documentos (estados
  `PENDIENTE`/`APROBADA`/`RECHAZADA` de este ítem), habilitación excepcional
  (US-28, la tabla ya existe) y filtro del listado por estado de habilitación
  (US-08).
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

#### DT-35 · El cobro de cuota deportiva quedó implementado; resta la generación y el autoservicio
*funcional · backend · parcialmente resuelto (US-21, 26/09/2026)*

**US-21** agregó el cobro de cuota deportiva por secretaría: modelo propio
`PagoCuotaDeportiva` (independiente de `Pago`/cuota social, con
`@@unique([personaId, disciplinaId, periodo])`), `PagosDeportivosService`
(pendientes por disciplina, registro atómico de uno o varios períodos, estado
`AL_DIA`/`MOROSO`, auditoría) y la pantalla *Cobrar cuota deportiva*
(ADMIN/COLABORADOR). Con esto ya **existe un camino de cobro** para la cuota
deportiva.

**Lo que sigue pendiente:**
- **Generación/emisión** de la cuota deportiva: hoy la deuda se deriva "al
  vuelo" desde la fecha de inscripción y la `ConfiguracionCuotaDeportiva`
  vigente (misma estrategia que la social); no hay emisión persistida (ver
  DT-24).
- **Acoplamiento monto ↔ categoría de socio:** el monto de la cuota deportiva
  se resuelve por la `CategoriaSocio` del participante (a través de su
  membresía). Un jugador **sin membresía** no tiene categoría y el cobro se
  rechaza con 400. Si el club admite jugadores no socios, hay que revisar de
  dónde sale el monto.
- **Autoservicio y matrícula/eventos:** el pago deportivo por el propio socio
  (equivalente a US-10) y las obligaciones de matrícula/eventos siguen sin
  cobrarse.

- **Relacionado:** [DT-24](#dt-24--la-planilla-documenta-generación-de-cuotas-que-no-existe), [DT-06](#dt-06--historias-de-usuario-para-sumar-al-backlog).
- **Detectado en el análisis funcional de dominio (22/09/2026); cobro implementado en US-21 (26/09/2026).**

### 🟡 Medias

#### DT-43 · El DNI no debe requerir fecha de vencimiento
*Nuevo · backend + frontend · detectado en US-05*

Actualmente, el modelo de datos `Documentacion` (`Documentacion.fechaVencimiento`)
y el DTO `CreateDocumentacionDto` (`fechaVencimiento: string` / `IsDateString`) exigen
obligatoriamente una fecha de vencimiento para todos los tipos de documentación del
catálogo. Sin embargo, el **DNI** es un documento de identidad que no requiere fecha
de caducidad para los trámites y habilitaciones deportivas en el club. Al exigir
vencimiento, se fuerza a registrar fechas ficticias en el sistema o en la UI.

**Arreglo:** hacer opcional `fechaVencimiento` (nullable en la base de datos y opcional
en el DTO/frontend) cuando el tipo de documento sea permanente o de identidad (`DNI`),
y adaptar la lógica de cálculo de vigencia en `EstadoDocumentalService` para que no
trate un documento permanente sin vencimiento como vencido o por vencer.

- **Rama sugerida:** `issue/TASK-<n>-DT-43-Dni-sin-vencimiento` (TASK-38 ya se usó para DT-05)


#### DT-44 · Las fechas guardadas a las 00:00 UTC corren la deuda deportiva un mes
*Nuevo · backend · detectado en DT-41*

`periodosEntre` (`src/cuotas/tarifas.ts`) toma el mes con `getMonth()`, en la
hora del servidor. Una fecha de inscripción guardada a las 00:00 UTC del día 1
(como las del seed, `new Date('2025-06-01')`) en hora argentina es el 31 del mes
anterior, así que la deuda empieza un mes antes: una alta del 01/06/2025 cobra
desde 2025-05. En Azure el servidor corre en UTC y no pasa; en local sí. Es el
mismo problema que resolvió `fix[US-25]` para la documentación.

**Arreglo:** calcular el período con la fecha en UTC (`getUTCFullYear` /
`getUTCMonth`) o normalizar las fechas de alta y baja al día, como
`estado-documental.ts`. Sumar un test con `TZ=America/Argentina/Buenos_Aires`.

- **Evidencia:** `docs/pruebas/evidencias/US-21/dt41-api.txt`.

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

#### DT-23 · El ratchet de cobertura corta el CI por décimas
*Nuevo · tooling · resuelto por ahora, dejar anotado*

Al cerrar DT-16 el piso de ramas quedó en 58 % y un PR del equipo (US-07) lo
dejó en 57,85 %: **el CI de `dev` quedó en rojo por 0,15 puntos** sin que nadie
hiciera nada mal. Se resolvió dejando ~3 puntos de margen, pero conviene
revisarlo si vuelve a pasar. La alternativa de fondo es exigir tests por PR
(regla de equipo) en lugar de apretar el número global.

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
- **Parcialmente resuelto en US-26 (03/10/2026):** la documentación por vencer,
  vencida o pendiente ya se avisa en el Inicio y por email a los delegados.
- **Infraestructura resuelta en TASK-35 (03/10/2026):** servicio centralizado de
  notificaciones ([decisión 0001](decisiones/0001-servicio-de-notificaciones.md)).
  Cada aviso pendiente es una plantilla más una llamada a
  `NotificacionesService.notificar`; push se suma como canal.
- **Rama sugerida:** `issue/TASK-28-DT-36-Notificaciones`

---

## Deuda resuelta

### TASK-42 · DT-26 · La API declara sus respuestas en Swagger
**`issue/TASK-42-DT-26-Documentar-respuestas-api`** (backend) · 04/10/2026

- `ErrorRespuestaDto` describe el formato común de error de `HttpExceptionFilter`
  y `@ApiErrores` (`src/common/swagger/respuestas.ts`) documenta cada código con
  los **mensajes reales** que devuelve el servicio, como ejemplos.
- Las **85 operaciones** declaran su respuesta exitosa con descripción, el 400
  de validación (body, query o parámetros), el 401/403 de los guards y los
  400/404/409 de negocio. Los errores se relevaron del código de cada servicio
  (incluidos los auxiliares que llama), no a mano.
- **Tipos de respuesta** en auth (`SesionRespuestaDto`, `PerfilRespuestaDto`),
  usuarios (`UsuarioRespuestaDto`, `UsuariosPaginadosDto`) y alertas
  (`AlertaDocumentacionDto`).
- `respuestas.spec.ts` arma el documento Swagger real y falla si una operación
  queda sin respuesta exitosa o sin errores declarados.
- **Resta** declarar el tipo de respuesta del resto de los módulos (socios,
  inscripción, cuotas, pagos, eventos, entradas, documentación). Conviene
  sumarlo módulo por módulo cuando se toque cada uno.
- Se apiló sobre DT-42 (comparten el endpoint de alertas): mergear DT-42 antes.

### TASK-41 · DT-41 · Historial de períodos de inscripción
**`issue/TASK-41-DT-41-Historial-de-periodos-de-inscripcion`** (backend) · 04/10/2026

- Tabla `periodos_inscripcion` (desde/hasta). Cada alta y reinscripción abre un
  período; cada baja (de una disciplina, del participante o por traslado) lo
  cierra. La migración crea un período por cada inscripción existente.
- La deuda de cuota deportiva se calcula sobre **todos** los períodos: al
  reinscribirse se conservan los meses impagos anteriores a la baja, y los
  meses entre la baja y la reinscripción no se cobran (nuevo rechazo «No se
  permite registrar pagos de meses en que no estuvo inscripto…»).
- Los tramos anteriores a esta migración que ya se habían pisado no se pueden
  recuperar.
- **Límites:** la tarifa de los períodos viejos usa la categoría actual de la
  inscripción, y el traslado *sin* inscripción previa en la disciplina destino
  sigue cambiando la disciplina de la misma fila (comportamiento anterior).
- Casos TC-178 y TC-179 (US-21).

### TASK-40 · DT-25 · La auditoría es inalterable también en la base
**`issue/TASK-40-DT-25-Auditoria-inalterable-en-la-base`** (backend) · 04/10/2026

- Triggers sobre `registros_auditoria` que rechazan UPDATE, DELETE y TRUNCATE
  («La auditoría es inalterable: no se permite … sobre registros_auditoria»).
- Consecuencia buscada: un usuario con registros de auditoría no se puede
  borrar físicamente (la FK pondría su `responsableId` en NULL). Los usuarios ya
  se dan de baja lógica.
- `auditoria.inalterable.spec.ts` lo prueba contra Postgres real. El CI crea
  una base de integración con `migrate deploy` y la pasa en
  `DB_INTEGRACION_URL`; sin esa variable, la suite se saltea.
- Límite: el dueño de la base puede deshabilitar los triggers
  (`ALTER TABLE … DISABLE TRIGGER`). Separar un rol de aplicación sin esos
  permisos queda para la infraestructura.
- Nueva ejecución de TC-024 y TC-074 a nivel base.

### TASK-39 · DT-42 · Cada delegado, solo sus disciplinas
**`issue/TASK-39-DT-42-Delegado-por-disciplina`** (backend + frontend) · 04/10/2026

- Tabla `delegados_disciplinas`. En Usuarios se puede elegir el rol
  **DELEGADO** (el formulario solo ofrecía ADMIN y COLABORADOR) y sus
  disciplinas a cargo; un delegado necesita al menos una. Si deja de ser
  delegado, pierde las disciplinas.
- Las alertas del Inicio y el email de vencimientos se filtran por las
  disciplinas del delegado (el ADMIN sigue viendo todo). Un delegado sin
  disciplinas no ve alertas. Las alertas de una disciplina sin delegado no se
  marcan como avisadas: salen cuando se asigne uno.
- El seed asigna Fútbol Mayor, Fútbol Femenino y Natación al delegado de
  prueba si no tiene ninguna.
- **Queda afuera** el filtro del listado de Participantes por disciplina
  (área de US-08): se puede sumar con `AlertasService.disciplinasVisibles`.
- Casos TC-173 a TC-177 (US-26).

### DT-42 · Los delegados no estaban asociados a disciplinas
Ver TASK-39 arriba.

### DT-25 · La auditoría append-only no estaba garantizada por la base
Ver TASK-40 arriba.

### DT-41 · Reinscribirse perdía la deuda de la inscripción anterior
Ver TASK-41 arriba.

### DT-26 · La documentación de la API no declaraba respuestas
Ver TASK-42 arriba.

### TASK-38 · DT-05 · Activar y desactivar la cuota deportiva
**`issue/TASK-38-DT-05-Activar-desactivar-cuota-deportiva`** (frontend) · 04/10/2026

- Cada tarifa de *Cuotas deportivas* ofrece «Desactivar» o «Activar», con
  confirmación. El diálogo explica el efecto: una tarifa inactiva no se usa
  para calcular la cuota (rige la anterior del mismo alcance o, si es de una
  categoría, la de la disciplina; si no hay ninguna, esos meses quedan sin
  tarifa). Usa `PATCH /cuotas/:id` con `{ activo }`, que ya existía y audita.

### TASK-37 · DT-33 · Vencimiento de las entradas
**`issue/TASK-37-DT-33-Expiracion-de-entradas`** (backend + frontend) · 04/10/2026

- Una entrada vence cuando termina su evento: `fechaFin` o, si no tiene,
  **12 horas después del inicio** (`src/eventos/fin-del-evento.ts`).
  - El control de acceso rechaza las de eventos terminados («Entrada
    expirada») y las marca EXPIRADAS, aunque la tarea todavía no haya corrido.
  - No se generan entradas para eventos terminados, cancelados o finalizados,
    y no se venden para un evento terminado aunque la venta no tenga cierre.
  - Tarea automática **`cierre-de-eventos`** (todos los días a las 05:00):
    finaliza los eventos publicados que terminaron y expira sus entradas sin
    usar. Es idempotente.
- Front: sin `fechaFin`, la tarjeta del evento usa la misma regla de 12 horas
  (antes lo mostraba «Finalizado» apenas empezaba, con las entradas todavía
  válidas).
- `validarAcceso` (US-31) no tenía tests: ahora los tiene
  (`expiracion-entradas.spec.ts`).
- Se integró sobre el rediseño de eventos de Task-E8: la primera versión de
  TASK-37 también resolvía DT-32 y rehacía el alta, pero Task-E8 lo resolvió
  antes y se usó lo suyo.

### Task-E8 · DT-32 · Fecha, fin y reglas de los eventos
**`issue/Task-E8-Fix-Pantalla-Modal-Eventos`** (backend #77, frontend #127) · 04/10/2026

- `Evento.fechaFin`, eventos sin entrada (`requiereEntrada`), descuento para
  socios, capacidad y período de venta opcionales; validación de fechas al
  crear y editar (`EventosService.validarFechas`) y edición de eventos.
- Front: alta y edición con todos los datos y vista en tarjetas con el estado
  del evento. Arregló además el alta, que hasta entonces respondía 400 porque
  el formulario no enviaba los campos obligatorios.

### DT-32 · Los eventos no tenían fecha ni horario completo
Ver Task-E8 arriba.

### DT-33 · Las entradas no podían expirar
Ver TASK-37 arriba.

### DT-05 · Faltaba activar/desactivar la cuota deportiva
Ver TASK-38 arriba.

### TASK-36 · DT-22 · Servicio centralizado de tareas automáticas
**`issue/TASK-36-DT-22-Servicio-de-tareas-automaticas`** (backend + frontend) · 03/10/2026

- `src/tareas/`: cada automatización es una clase `@Tarea()` en su módulo de
  dominio; `TareasService` las descubre, las ejecuta con un lock de PostgreSQL
  por tarea y registra cada ejecución en `ejecuciones_tareas`.
- Un solo disparador (`POST /tareas/:nombre/programada`, token `TAREAS_TOKEN`)
  y un solo workflow (`tareas-automaticas.yml`) con el horario de cada tarea.
  Reemplaza a `/alertas/documentacion/notificar` y `alertas-documentacion.yml`.
- Tareas: `vencimientos-documentacion` (US-26), `reintentar-notificaciones`
  (DT-36) y `rotacion-cuota-social`, que **cierra DT-22**: la rotación mensual
  ya tiene quién la dispare.
- *Administración → Tareas automáticas*: última ejecución, resultado,
  historial y «Ejecutar ahora» (auditado).
- Decisión, patrones y alternativas descartadas:
  [`decisiones/0002`](decisiones/0002-servicio-de-tareas-automaticas.md).

### DT-22 · La rotación mensual de la cuota social no tenía quién la dispare
Resuelta por la tarea automática `rotacion-cuota-social` (TASK-36, ver arriba),
que llama a `CuotaSocialService.sincronizarVigentes` el día 1 de cada mes.

### TASK-35 · DT-36 · Servicio centralizado de notificaciones
**`issue/TASK-35-DT-36-Servicio-de-notificaciones`** (backend) · 03/10/2026

- `src/notificaciones/`: facade `NotificacionesService`, canales intercambiables
  (`Canal`, hoy `CanalEmail`), proveedor de email reemplazable (`ProveedorSmtp`),
  plantillas con esqueleto común (`PlantillaEmail`) y tabla `notificaciones`
  como outbox (estado, intentos, error y `referencias` para no repetir avisos).
- US-26 pasa a usarlo: cada delegado recibe su email; lo ya avisado se migró y
  no se reenvía (`alertas_documentacion_notificadas` se elimina).
- Decisión, patrones y alternativas descartadas:
  [`decisiones/0001`](decisiones/0001-servicio-de-notificaciones.md).


### US-26 · Alertas por vencimiento de documentación, con aviso por email
**`feature/US-26-Alertas-vencimiento-documentacion`** (backend + frontend) · 03/10/2026

- **Cálculo, no jobs:** `alertasDeDocumentacion` deriva las alertas del estado
  documental (US-25) en el momento: documentos que vencen o cuyo plazo de
  presentación termina en los próximos **10 días** (`DIAS_ALERTA`), más lo ya
  vencido. El estado "Por vencer" sigue mirando 30 días; la alerta, 10.
- **Inicio:** `GET /alertas/documentacion` (ADMIN, DELEGADO) alimenta una tabla
  en el Inicio del ADMIN y un Inicio propio del DELEGADO (antes caía en la
  pantalla neutra con "Hacerme socio"). Cada fila abre la documentación del
  participante.
- **Email:** `MailService` por SMTP genérico (nodemailer), apto para proveedores
  gratuitos (Brevo recomendado). Sin `SMTP_HOST` no envía. El workflow
  `alertas-documentacion.yml` despierta la API una vez por día (escala a cero:
  un cron interno no correría) y llama a `POST /alertas/documentacion/notificar`
  con `x-cron-token`. Cada alerta se avisa una sola vez
  (`alertas_documentacion_notificadas`); el envío queda auditado. Configuración
  en `DESPLIEGUE.md` §5.2.1.
- **Fechas en UTC:** `dia`/`formatear` del estado documental leían las fechas
  guardadas (00:00 UTC) en hora local: en Argentina un vencimiento del 10/01
  se mostraba como 09/01 en los motivos de bloqueo. En Azure no se veía (el
  contenedor corre en UTC). Ahora se leen en UTC y "hoy" en hora local.
- Detectado: [DT-42](#task-39--dt-42--cada-delegado-solo-sus-disciplinas).


### DT-01 · Cobertura de testing frontend alcanzada (70 % DoD)
**PR [#110](https://github.com/lucasgazzola/socialclub-frontend/pull/110)** ·
**`issue/TASK-34-DT-01-Cobertura-frontend-70`** (frontend) · 02/10/2026

Se implementó la suite completa de tests unitarios y de integración de componentes, páginas, modales, hooks, servicios y schemas en el frontend para alcanzar el objetivo mínimo del 70 % de cobertura exigido por la Definition of Done (subiendo del 45,35 % al 70,13 % de statements y 71,09 % de líneas, con 81 suites y 399 tests totales pasando).

- **Statements:** **70,13 %** (1597 / 2277).
- **Líneas:** **71,09 %** (1532 / 2155).
- **Ramas:** **69,01 %** (1441 / 2088).
- **Funciones:** **60,51 %** (567 / 937).
- Se cubrieron exhaustivamente los módulos sin tests previos o con cobertura insuficiente (`auditoria`, `auth`, `cuota-social`, `cuotas`, `dashboard`, `disciplinas`, `documentacion`, `entradas`, `inscripcion`, `pagos`, `socios`, `usuarios`, `routes` y componentes comunes de UI).
- Se elevó el ratchet en `vitest.config.ts` a `statements: 67, branches: 66, functions: 57, lines: 68` conservando los ~3 puntos de margen acordados.

### Decisión · Cuota deportiva por disciplina y categoría, con descuento para socios (US-20)
**`issue/TASK-33-US-20-Cuota-deportiva-por-disciplina`** · 02/10/2026

Decisión del equipo: la tarifa de la cuota deportiva depende de la
**disciplina**, y una **categoría de la disciplina** puede tener tarifa propia
que reemplaza a la base. Antes dependía de la categoría de **socio**, con dos
errores: quien no era socio debía $0, y dar de baja una disciplina borraba su
deuda.

- `ConfiguracionCuotaDeportiva`: `categoriaDisciplinaId` opcional (null = tarifa
  base) y `descuentoSocioPorcentaje` (0 a 100). La migración conservó una tarifa
  base por disciplina y período (la de monto más alto) y descartó la apertura
  por categoría de socio.
- Período **mensual**. Los cambios rigen desde el mes siguiente; la **primera**
  tarifa de una disciplina/categoría puede regir desde el mes actual.
- El **descuento para socios** se aplica en los meses en que la persona tenía
  la membresía activa.
- Se cobran completos el mes de alta y el de baja; la deuda anterior a la baja
  se conserva y se puede cobrar. Sin tarifa para un mes: "Sin tarifa", no $0, y
  no se puede cobrar.
- Sin matrícula por ahora. Límite conocido: DT-41.

### DT-20 · Modales unificados y estandarizados
**`issue/TASK-32-DT-20-Modales-unificados`** (frontend) · 01/10/2026

Las ediciones de socio, cuota social y participante dejaron de ser páginas
aparte: se abren como modal sobre su listado (`?editar=<id>`) y las rutas
viejas (`/socios/:id/editar`, etc.) redirigen ahí. La de participante suma
pestañas para datos y documentación.

Además se estandarizó el `Modal` del design system para que todos se vean
igual:
- **Tamaños fijos:** `sm` (confirmaciones), `md` (formularios cortos), `lg`
  (formularios) y `xl` (fichas con secciones), en lugar de anchos sueltos por
  pantalla.
- **Encabezado:** ícono opcional en un chip con tono (`brand`, `danger`,
  `success`, `warning`), título y descripción.
- **Acciones:** siempre a la derecha y fijas al pie; Cancelar (secundario) antes
  de la acción principal. `ModalActions` lo resuelve para los formularios.
- **Comportamiento:** entrada sutil (desactivada con *reduced motion*) y hoja
  inferior a todo el ancho en móvil; se mantiene la accesibilidad (foco
  atrapado, Escape, devolución del foco).

**Regla para lo que venga:** altas y ediciones van en `Modal`; las acciones van
en `footer` o en `ModalActions`; no se pasan anchos por `className`.

### DT-39 · La inscripción no aplicaba las restricciones de edad y género
**`issue/TASK-31-DT-27-Estado-documental-e-inscripcion`** · 01/10/2026

El alta y la edición de inscripción validan género y edad contra la categoría
o, si no las define, contra la disciplina, e informan el motivo. La edad se
mide **por año de nacimiento** (decisión del equipo del 01/10/2026). El alta
pide fecha de nacimiento y género; a una persona ya registrada solo se le
completan los datos que le falten. La edición de participante también permite
cargar el género.

### DT-11 · Pantalla única de participantes (inscripción y documentación)
**PR [#101](https://github.com/lucasgazzola/socialclub-frontend/pull/101)** ·
**`issue/TASK-29-DT-11-Pantalla-unica-de-participantes`** · 01/10/2026

Participantes pasa a ser la pantalla única del participante: el alta de
inscripción se abre en un modal ("Nueva inscripción") y cada participante
tiene su documentación (modal desde el listado y sección en la edición). Se
quitaron del menú Inscripción y Documentación; `/inscripcion` y
`/documentacion` redirigen a Participantes. Componentes nuevos:
`InscripcionForm` y `DocumentacionParticipante`.

- De paso se corrigió un bug de US-08: el debounce de la búsqueda volvía a la
  página 1 a los 300 ms de cargar la pantalla y pisaba el "Siguiente".
- **Sigue pendiente DT-28** (el propio participante no ve su documentación).

### DT-17 · Código muerto: `EditarInscripcionPage`
Resuelta junto con DT-11 (PR #101): el archivo se eliminó.

### DT-40 · Los selectores de fecha mostraban mm/dd/aaaa
**PR [#100](https://github.com/lucasgazzola/socialclub-frontend/pull/100)** ·
**`issue/TASK-30-DT-40-Formato-de-fecha-dd-mm-aaaa`** · 01/10/2026

El `<input type="date">` nativo toma el formato del idioma del navegador. Se
creó `DateInput` (`components/ui`): máscara dd/mm/aaaa, calendario nativo
desde un botón y valor siempre en ISO, así que la API y los schemas no
cambiaron. Reemplazó las 6 fechas del producto. Los selectores de mes
(`type="month"`, cuotas) quedan como estaban.

### DT-38 · Test de eventos intermitente (`inicioVenta`)
**`fix/US-50-Categorias-inactivas-en-inscripcion`** · 01/10/2026

`eventos.service.spec.ts › create` comparaba `inicioVenta` contra la fecha del
DTO, pero el servicio la genera con `new Date()` cuando no viene: el test
fallaba cada vez que las dos fechas caían en milisegundos distintos (≈1 de cada
3 corridas), y con eso el CI. Ahora espera `expect.any(Date)`. Corrida 5 veces
seguidas en verde.

### DT-37 · El esquema de Prisma y las migraciones divergen (drift silencioso)
**PR [#57](https://github.com/lucasgazzola/socialclub-backend/pull/57)** ·
**`fix/db-migracion-drift-disciplinas-cuota-deportiva`** · 29/09/2026

`prisma/schema.prisma` tenía objetos que **ninguna migración versionada creaba**:
las columnas `Disciplina.genero` / `edadMinima` / `edadMaxima` /
`solicitaDocumentacion` (con el enum `GeneroDisciplina`), la tabla
`disciplina_requerimientos_doc` (enum `TipoDocumentacionDisciplina`) y la tabla
`pagos_cuota_deportiva`. Los commits `5555482` (ABM de disciplinas) y `2208b44`
(US-21) editaron el schema **sin generar la migración**.

**Por qué no saltó antes:** el `CLAUDE.md` documentaba `npx prisma db push` como
forma de sincronizar el esquema. `db push` reconcilia la base contra el schema
actual, así que la base local de cada integrante quedaba bien y el drift era
invisible. Pero `docker-entrypoint.sh` aplica **`prisma migrate deploy`** en
cuanto existen migraciones versionadas (Docker local, test y main): esas
columnas y tablas nunca llegaban a esas bases.

**Cómo se manifestó:** `GET /api/v1/inscripcion?pagina=1&porPagina=10` (US-08) y
`GET /api/v1/disciplinas` devolvían 500 —
`PrismaClientKnownRequestError: The column disciplinas.genero does not exist in the current database`—
porque el `include: { disciplina: true }` de los `findMany` selecciona todas sus
columnas. Lo mismo le esperaba a test en la próxima promoción `dev → test`, con
el CD en verde (el contenedor falla al atender, no al arrancar).

**Arreglo:** migración
`20260929174633_restricciones_disciplina_y_pago_cuota_deportiva` (solo aditiva:
2 tipos enum, 4 columnas en `disciplinas` —`solicitaDocumentacion` con
`DEFAULT false`— y las 2 tablas con sus índices y FK), reemplazo del `db push`
por `npm run prisma:migrate` en el `CLAUDE.md` (`db push` solo vale mientras no
haya migraciones) y **chequeo de drift en el CI**
(`npm run prisma:check-drift` → `prisma migrate diff --from-migrations … --exit-code`
contra un Postgres efímero): el PR falla si el schema vuelve a divergir.

- **Para test/main:** no promover `dev → test` sin esta migración; el entrypoint
  la aplica solo, es aditiva y no necesita backfill.

---

### DT-30 · ABM de disciplina
**TASK-18 (US-44 a US-47)** · 22/09/2026 · categorías y restricciones por
categoría en US-48 a US-51 (01/10/2026)

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
- `docs/exportables/casos-prueba.csv` (hoy `docs/pruebas/casos-prueba.csv`) pasó a ser el dump de esa planilla, no una fuente paralela. El mapa viejo→nuevo quedó en el historial de git: `git show ada3020:docs/exportables/mapeo-DT-18.csv`.
- Los 17 casos de US-16/US-32 que estaban listos para pegar (`TC-084`..`TC-100`) pasaron a `TC-091`..`TC-107` para no chocar con los IDs nuevos de US-38/39/40.
- Los specs que etiquetaban `TC-xxx` se remapearon **por US** (auth/US-38, socios/US-12). Los de usuarios (US-02) no se tocaron: esos IDs no cambian. Los `TC-0701` / `TC-0801` de inscripción son otro esquema y se dejaron.
- `scripts/exportar-casos.mjs` + `scripts/ids-planilla.py` leen el máximo del `.xlsx` y de `docs/pruebas/*.csv`, y se niegan a asignar si vuelven a aparecer duplicados. El próximo ID libre es **`TC-108`**.

La copia de Drive se actualiza pegando `docs/pruebas/para-pegar/casos-prueba.tsv`
(no el CSV; lo regenera `npm run docs:para-pegar`). El `.xlsx` del repo es local y gitignored.

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

La fuente de verdad es la planilla de Drive (*Plan de testing del producto*,
hojas *Casos de Prueba*, *Ejecución de Pruebas*, *Defectos*, *Conformidad PO*,
*Resumen*). `docs/pruebas/` la espeja en git: consolidados, TSV para pegar y
evidencias por historia. Cómo se organiza y cómo se actualiza:
[`pruebas/README.md`](pruebas/README.md). Cantidades medidas al día:
[`PLAN-TESTING.md`](PLAN-TESTING.md).

## Nomenclatura

Lo que ya usa el equipo, aplicado a la deuda técnica:

- **Ramas:** `issue/TASK-<n>-DT-<nn>-<Descripcion-en-kebab>` para deuda
  identificada; `fix/<Descripcion>` para arreglos de configuración o tooling.
  El número `TASK` es correlativo y global. **Último usado: TASK-42**
  (04/10/2026).
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
