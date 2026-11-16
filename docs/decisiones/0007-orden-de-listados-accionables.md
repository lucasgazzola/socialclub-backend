# 0007 · Orden de los listados que piden una acción

- **Estado:** Aceptada
- **Fecha:** 15/11/2026
- **Código:** ver «Archivos» al final. No hay migración ni cambio de schema.

## Contexto

Varios listados del panel paginan en SQL y recién después calculan el dato que la persona que opera necesita ver. El dato (un certificado para revisar, una cuota vencida, un evento que ya terminó) no es una columna de la tabla que se está paginando, así que ordenar o filtrar solo la página visible deja afuera lo urgente.

Se recorrieron las vistas del panel con el padrón demo cargado (15/11/2026, `socialclub_local`) y se cambió solo donde el orden por defecto escondía trabajo pendiente. El resto ya abre en la cola correcta o es un catálogo.

| Vista | Qué se vio | Qué se hizo |
|---|---|---|
| Participantes (`/admin/participantes`) | El alta pendiente de revisión quedaba enterrada: el listado ordenaba por apellido y el estado documental se calcula después de `skip`/`take`. | Pendientes de aprobación primero, más un filtro de documentación. Hecho en la misma tanda, antes de socios y eventos. |
| Socios (`/admin/socios`) | La primera página mezclaba «Al día» y «Moroso». El badge sale de un hook por fila (`useCuotasPendientesSocio`), después de paginar por `creadoEn desc`. | Morosos primero, más filtro Morosos / Al día. |
| Eventos, panel y portal | `ordenar=fecha` era `fechaEvento asc`. La primera página arrancaba en la peña de primavera (finalizada), el clásico (finalizado) y el bingo (cancelado). La peña de socios, que es mañana, quedaba más abajo. El rango Desde/Hasta ya existía. | Los que siguen en curso primero, más un segmento por estado. El rango de fechas se dejó. |
| Solicitudes de reserva | Ya abre en la pestaña Pendientes (`RES-1847` arriba). | Nada. |
| Morosos cuota social y deportiva | Ya son la cola de cobro y ordenan por monto. | Nada. No se las reemplaza por el filtro de Socios. |
| Usuarios, espacios, disciplinas, tarifas, auditoría, tareas, dashboard | Catálogos o historiales. Poner inactivos o viejos primero escondería a quien se usa. | Nada, salvo el arreglo del gráfico del dashboard (ver más abajo): no es un orden, es un crash al clickear el anillo. |

## Decisión

### Regla general

Si el criterio no se puede expresar en el `ORDER BY` de Prisma, la consulta del caso por defecto (y la del filtro nuevo) trae el conjunto que ya matchea búsqueda, categoría y estado, lo clasifica, lo ordena y **después** corta la página. Un `ORDER BY` de una columna real (nombre, DNI, email, fecha de alta, «más recientes») sigue paginando en SQL.

Ordenar solo las 10 filas ya devueltas no alcanza: un moroso de la página 4 nunca sube a la 1.

### Participantes

`GET /inscripcion`.

- Sin un orden de columna de la base (`dni`, `fecha`, `creadoen`, `nombre`, `apellido`, `participante`), o con el filtro de documentación, se cargan todas las inscripciones que matchean, se clasifican y se pagina en memoria.
- Prioridad del orden por defecto: documentación en `PENDIENTE_REVISION` (0), estado de inscripción `PENDIENTE` (1), `BLOQUEADO` (2), `HABILITADO` (3), el resto (4). Desempate por apellido y nombre.
- Filtro nuevo `estadoDocumental`: `PENDIENTE_APROBACION | PENDIENTE | BLOQUEADO | HABILITADO`. `PENDIENTE_APROBACION` mira documentos en `PENDIENTE_REVISION`, no el estado de la inscripción. Por eso Sofía Ibáñez (certificado `RECHAZADO`) queda como «Pendiente de documentación» y no entra en «Pendiente de aprobación».
- Los conteos de las pestañas Todos / Inscriptos / Baja siguen siendo `count` de SQL del estado de inscripción. El filtro de documentación no los cambia.
- Nombre, DNI y fecha siguen con `skip`/`take` de SQL.

Verificado en el navegador antes de esta decisión: la página abre con Ortiz Camila, Vera Marcos e Ibáñez Sofía; «Pendiente de aprobación» deja solo a Camila y Marcos.

### Socios

`GET /socios`. Query nuevo: `estadoCuenta=MOROSO|AL_DIA`.

**Quién es moroso.** La misma regla que el badge de la fila y que US-19 (`DIA_VENCIMIENTO_CUOTA_SOCIAL = 10`):

- Membresía usada: la activa; si no hay, la última por `fechaAlta desc` (el `include` ya viene ordenado así).
- Períodos: mes de `fechaAlta` hasta el mes de `fechaBaja`, o hasta el mes de hoy si sigue de alta. Calendario local del servidor. Lo arma `periodosDesdeHasta`.
- Un período cuenta si no está pago y `cuotaVencida` es true. Los meses anteriores siempre vencieron. El mes en curso vence recién el día 11. Los meses futuros no.
- `PagosService.generarPeriodosHasta` ahora delega en `periodosDesdeHasta`. Antes repetía el mismo recorrido. Si las dos copias se separaban, el listado y el cobro iban a decir cosas distintas.

**Orden por defecto** (sin `ordenarPor`, o con un criterio que no es columna de SQL: categoría, estado, cuenta):

1. Morosos antes que al día.
2. Entre morosos, más períodos vencidos primero; empate por apellido y nombre.
3. Entre al día, `creadoEn desc` (se conserva «el alta más nueva» dentro de ese grupo).

**Qué sigue en SQL.** `ordenarPor` `dni`, `email`, `nombre`, `apellido`, `socio`, `fecha`, `creadoen`, `alta`. Si además viene `estadoCuenta`, se trae el conjunto, se filtra y se respeta el orden de SQL: el filtro no puede paginar antes de saber quién debe.

**Conteos de pestañas.** `todos` / `alta` / `baja` siguen siendo counts de membresía. No bajan al filtrar morosos. Igual que en participantes.

**La tabla no reordena la página.** `SociosTable` volvía a ordenar las filas recibidas por `creadoEn desc` cuando no había columna elegida. Eso deshacía el orden del servidor en la única página que el usuario ve. Ahora, sin columna, la tabla muestra el array tal cual llegó. Las columnas (nombre, DNI, email, categoría, estado) siguen ordenando la página que ya mandó el backend.

**El listado de morosos de US-19 no se toca.** Ordena por monto adeudado y es la cola de cobro. El filtro de Socios responde «¿quién debe?» dentro del padrón; no dice cuánto.

**Por qué no se inyectó `PagosService`.** La mora del listado solo necesita períodos y la regla del día 10. No necesita tarifas ni la pasarela. Meter el servicio en `SociosService` arrastraba el módulo de pagos a todos los specs de socios y abría un ciclo que hoy no existe (`SociosModule` solo importa verificación de email).

### Eventos

`GET /eventos`. Query nuevo: `estado` (`EstadoEvento`).

- `ordenar` ausente o `ordenar=fecha` (el default de la pantalla) ya no es `fechaEvento asc`. Primero van los `PUBLICADO` que todavía no terminaron, del más próximo al más lejano. Después, el resto (finalizados, cancelados, borradores y publicados ya vencidos), del más reciente al más antiguo.
- «Terminó» es `eventoTerminado`: `fechaFin`, o `fechaEvento` más 12 horas si no hay fin (`DURACION_POR_DEFECTO_HORAS`). Un evento de hoy que sigue en curso no se manda al fondo. Comparar `fechaEvento >= hoy` lo habría hecho.
- El valor del query sigue siendo `fecha`. Cambiarlo a otro string habría dejado a los clientes viejos (y al portal, que ya rotulaba esa opción «Más próximos») en el orden viejo. Se cambió el significado y el rótulo del panel a «Ordenar: próximos primero».
- `ordenar=nombre` y `ordenar=reciente` siguen paginando en SQL.
- Segmento de la UI: Todos / Publicados / Finalizados / Cancelados. El checkbox «Ver borradores» se sacó de la barra el 15/11: el listado no los muestra. El query `incluirBorradores=true` sigue en la API, solo para un ADMIN, y el formulario todavía puede guardar un evento como borrador.
- `estado=BORRADOR` con un usuario que no es admin responde vacío (`where.id = -1`). No se listan borradores por pedir el estado.
- El rango Desde/Hasta no se reescribió. Sigue filtrando `fechaEvento`.
- El `OR` de `search` y el `OR` de `soloDisponibles` se pisan si vienen juntos. Estaba así. No se tocó: corregirlo cambia el contrato de una combinación que esta tarea no usa.

El portal (`PortalEventosPage`) consume el mismo endpoint. Hereda el orden nuevo y suma el mismo segmento de estado. Su opción «Más próximos» ya decía eso; ahora el endpoint coincide.

### Dashboard (mismo working tree, otro problema)

`DashboardGraficos` arma dos tortas de Recharts. La de atrás es un anillo decorativo `[{ valor: 1 }]` con relleno `#f1f5f9` y no tiene `porcentaje`. El tooltip hacía `porcentaje.toFixed` y un click en el hueco (`paddingAngle`) tiraba abajo la página. `tooltipType="none"` no alcanza: el tooltip custom igual recibe el payload. El anillo decorativo quedó con `pointerEvents="none"` y el tooltip ignora el punto si `porcentaje` no es un número.

### Vistas que se dejaron a propósito

- Solicitudes de reserva: default `PENDIENTE_APROBACION`, `inicio asc`.
- Morosos cuota social y deportiva: ya son la cola, ordenadas por monto.
- Usuarios: apellido asc. Inactivos primero escondería a quien opera.
- Espacios: nombre asc.
- Disciplinas, tarifas de cuota, auditoría (lo nuevo primero), tareas, el resto del dashboard.

## Alternativas

- **Ordenar la página que ya devolvió SQL.** Se descartó. Es exactamente el bug: la página 1 de socios mezclaba cinco al día y cinco morosos, y la peña de mañana no era el primer evento.
- **Columna persistida `periodosVencidos` o estado `FINALIZADO` escrito por una tarea.** Haría el `ORDER BY` en SQL, pero hay que mantenerla en cada pago, baja y cambio de día. El padrón demo tiene 87 socios y 6 eventos. El costo de traer ese conjunto y cortar en memoria es el que se acepta ahora. Si el padrón crece a decenas de miles, esta decisión se reemplaza por una columna o una expresión SQL, no se «arregla» volviendo a paginar antes de clasificar.
- **Inyectar `PagosService` en `SociosService`.** Se descartó. La regla cabe en una función pura y el listado de morosos por monto sigue siendo el dueño del cobro.
- **Un `ordenar` nuevo en vez de cambiar `fecha`.** Se descartó. El default de las dos pantallas y el rótulo del portal ya querían «próximos». Un valor nuevo dejaba el default viejo para quien no lo mande.
- **Sacar la página de morosos** porque Socios ahora filtra. Se descartó. Esa página ordena por monto y es otra tarea (cobrar). El filtro de Socios no la cubre.
- **Borradores dentro del select de estado para todo el mundo.** Se descartó. Un no-admin no puede ver borradores. El checkbox que los mostraba al admin se eliminó de la pantalla; no se reemplazó por otra opción del select.

## Consecuencias

- El badge «Moroso (n)» de cada fila sigue saliendo de `useCuotasPendientesSocio` (una consulta por fila visible). El orden no lo usa: los períodos viajan en el `include` de la consulta del listado. El N+1 del badge queda igual.
- Con el orden por defecto, socios y eventos leen todas las filas que matchean los otros filtros y recién ahí cortan la página. Con 87 socios el `GET` respondió en la misma llamada que el resto del listado. No escala solo: ver la alternativa de la columna.
- Un `ordenarPor` de columna en Socios desactiva «morosos primero». El subtítulo de la pantalla lo dice.
- Las pestañas de alta/baja no reflejan el filtro de cuenta. Es deliberado.
- `ValidationPipe` está con `forbidNonWhitelisted`. Un API que no haya recargado responde 400 a `estadoCuenta` y `estado`. El `nest start --watch` de esta máquina recargó y aceptó los dos.
- El portal sigue ofreciendo «Menor precio» (`ordenar=precio`). El DTO solo acepta `nombre | reciente | fecha`, así que esa opción responde 400. Estaba antes. No se cambió: no es el orden de «lo que hay que hacer» y tocarla cambia un contrato que esta decisión no necesita.
- Nada de esto está commiteado. Vive en el working tree de `feature/seed-padron-demo`, encima de los commits de la seed (backend `f3a72b8`, frontend `922e16d`). No entra en los PR #134 y #190 hasta que se haga un commit aparte.

### Cómo se comprobó (15/11/2026)

- `npx jest src/socios/socios.service.spec.ts src/eventos/eventos.service.spec.ts src/pagos/vencimiento-cuota-deportiva.spec.ts`: 47 pruebas, todas verdes. Cubren morosos primero, filtro `MOROSO`, orden por nombre/DNI/categoría/estado, próximos primero, `estado=PUBLICADO`, borrador vacío para no admin, y que `page`/`limit` con `ordenar=reciente` sigue usando `skip`.
- `periodosVencidosImpagos(2026-09-01 → 2026-11-15, pago solo 2026-09) === 2` (octubre vencido y noviembre, porque el 15 es posterior al día 10). Los tres meses pagos dan 0.
- Frontend, vitest 4.1.11: `SociosPage.test.tsx`, `SociosTable.test.tsx`, `EventosPage.test.tsx`. 29 pruebas verdes. La tabla ahora afirma que conserva el orden recibido.
- API local (`nest start --watch`, pid recargado el 15/11 a las 22:12, cookie de `admin@socialclub.local`):
  - `GET /socios?porPagina=10`: los 8 morosos ocupan las primeras filas (3, 3, 2, 2, 2, 1, 1 y 1 período) y las dos últimas son Ibáñez Daniela y Cáceres Santiago, al día. `estadoCuenta=MOROSO` devuelve total 8. `estadoCuenta=AL_DIA` devuelve total 79 y no comparte ids con los morosos.
  - `GET /eventos?porPagina=5`: Peña de socios (`PUBLICADO`, 2026-11-16), Cena de fin de año, Torneo de verano infantil, Bingo de la comisión (`CANCELADO`), Clásico de veteranos (`FINALIZADO`).
- Navegador en `http://localhost:5173` con la sesión de admin:
  - `/admin/socios` abre con el subtítulo nuevo, el select «Filtrar por estado de cuenta» y las filas Moroso (3) … Moroso (1) antes de las dos «Dar de alta». Al elegir Morosos quedan 8 filas y una sola página.
  - `/admin/eventos` abre con Peña de socios, Cena, Torneo, Bingo y Clásico. «Finalizados» deja el Clásico (11/10) y después la peña de primavera (septiembre): entre lo ya cerrado, el más reciente primero. Desde/Hasta siguen en la barra.

### Archivos

Backend:

- `src/pagos/vencimiento-cuota-deportiva.ts` y su spec: `periodosDesdeHasta`, `periodosVencidosImpagos`.
- `src/pagos/pagos.service.ts`: `generarPeriodosHasta` delega. Se borró `toPeriodo`, que solo usaba ese método.
- `src/socios/dto/find-socios-query.dto.ts`: `EstadoCuentaSocioFiltro`.
- `src/socios/socios.service.ts`, `socios.controller.ts`, `socios.service.spec.ts`.
- `src/eventos/dto/filtrar-eventos.dto.ts`, `eventos.service.ts`, `eventos.controller.ts`, `eventos.service.spec.ts`.
- `src/inscripcion/dto/find-participantes-query.dto.ts`, `inscripcion.service.ts`, `inscripcion.controller.ts`, `inscripcion.service.spec.ts` (la parte de participantes, previa a socios y eventos).

Frontend:

- `src/features/socios/types.ts`, `api/socios.api.ts`, `pages/SociosPage.tsx`, `pages/SociosPage.test.tsx`, `components/SociosTable.tsx`, `components/SociosTable.test.tsx`.
- `src/features/eventos/api/eventos.api.ts`, `pages/EventosPage.tsx`, `pages/EventosPage.test.tsx`.
- `src/features/portal-socio/pages/PortalEventosPage.tsx`.
- `src/features/inscripcion/types.ts`, `api/inscripcion.api.ts`, `hooks/useInscripciones.ts`, `pages/ParticipantesPage.tsx`, `pages/ParticipantesPage.test.tsx`.
- `src/features/dashboard/components/DashboardGraficos.tsx`.
