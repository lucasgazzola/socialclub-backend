# 0002 · Servicio centralizado de tareas automáticas

- **Estado:** Aceptada
- **Fecha:** 03/10/2026 · **TASK-36** · DT-22 (base de DT-33, DT-35 y DT-36)
- **Código:** `src/tareas/` (backend) · *Administración → Tareas automáticas* (frontend)
- **Depende de:** [0001](0001-servicio-de-notificaciones.md)

## Contexto

El sistema necesita procesos que corran solos: hoy, avisar los vencimientos
de documentación (US-26) y activar la cuota social del mes (DT-22, que nadie
disparaba). Después vendrán la expiración de entradas (DT-33), la generación
de cuotas (DT-35) y el aviso de cuotas vencidas.

US-26 lo resolvió con un endpoint, un token y un workflow propios. Repetir eso
por cada automatización multiplica endpoints, secrets y workflows, y no deja
registro de cuándo corrió cada una ni con qué resultado.

**Restricción que manda:** la API corre en Azure Container Apps con
`minReplicas: 0`. Sin tráfico no hay proceso vivo, así que un cron dentro de
Nest (`@nestjs/schedule`) no se ejecuta. Dejar una réplica siempre prendida
consume el crédito de Azure, y con dos réplicas el cron corre dos veces.

## Decisión

**El reloj está afuera y la lógica adentro.** Un único workflow de GitHub
Actions (`tareas-automaticas.yml`) despierta la API según el horario de cada
tarea y llama a un único disparador. Qué hace cada tarea, cómo se evita que
corra dos veces y cómo se registra vive en la API.

```
GitHub Actions (cron) ─► POST /tareas/:nombre/programada  (token)  ─┐
ADMIN en la app ───────► POST /tareas/:nombre/ejecutar    (JWT)    ─┤
CLI / Container Apps Job (a futuro) ────────────────────────────────┤
                                                                    ▼
                     TareasService (Invoker)
                      ├─ lock por tarea (pg_try_advisory_xact_lock)
                      ├─ registro en ejecuciones_tareas
                      └─ Registry (@Tarea() + DiscoveryService)
                           ├─ vencimientos-documentacion  (alertas)
                           ├─ reintentar-notificaciones   (notificaciones)
                           └─ rotacion-cuota-social        (cuota-social)
```

### Patrones aplicados

| Patrón | Dónde | Por qué |
|---|---|---|
| **Command** | `TareaAutomatica` (`nombre`, `descripcion`, `horario`, `ejecutar(contexto)`) | Cada automatización es un objeto que se ejecuta igual la dispare el horario, un ADMIN o (a futuro) un comando por línea de comandos. Las tareas solo contienen lógica de dominio. |
| **Invoker** | `TareasService.ejecutar` | Concentra lo transversal: lock, registro, manejo de errores y auditoría de las ejecuciones manuales. Se eligió composición (el Invoker envuelve la tarea) en lugar de una clase base con Template Method: las tareas no heredan nada y se testean solas. |
| **Registry por descubrimiento** | decorador `@Tarea()` y `DiscoveryService` de Nest | Cada módulo de dominio declara sus tareas; `tareas` no importa a ninguno. Sumar una tarea no modifica el servicio (principio abierto/cerrado) y evita dependencias circulares. Nombres repetidos hacen fallar el arranque. |
| **Mutex distribuido** | `pg_try_advisory_xact_lock(hashtext('tarea:<nombre>'))` | La misma tarea no corre dos veces en paralelo (dos réplicas, un disparo manual durante el programado, un reintento de GitHub). Si está tomada, la ejecución queda **OMITIDA**. El lock dura lo que la transacción: se libera solo aunque el proceso caiga. |
| **Ports & Adapters** (disparadores) | `POST …/programada` (token), `POST …/ejecutar` (ADMIN) | El núcleo no sabe quién lo llamó. Migrar de GitHub Actions a Container Apps Jobs es sumar un punto de entrada que llame a `TareasService`. |
| **Operación idempotente** | cada tarea | Correrla dos veces no duplica nada: las alertas se deduplican por `referencias` (decisión 0001) y la rotación de la cuota social deja el mismo estado. Es requisito, porque GitHub reintenta y un ADMIN puede apretar el botón. |

### Decisiones de detalle

- **Registro:** cada ejecución queda en `ejecuciones_tareas` (origen, usuario
  si fue manual, estado EN_CURSO / EXITOSA / FALLIDA / OMITIDA, resultado JSON
  y error). Si una ejecución quedó EN_CURSO porque el proceso se cortó, la
  siguiente la marca FALLIDA («Interrumpida»).
- **Errores:** una tarea que lanza un error queda FALLIDA con el mensaje; la API
  no se cae. El disparador programado responde siempre 200 con la ejecución y
  **el workflow falla** si el estado es FALLIDA (el filtro global oculta el
  detalle de los 5xx, así que el error viaja en la respuesta).
- **Auditoría:** las ejecuciones manuales se auditan (quién y qué tarea); las
  programadas quedan en `ejecuciones_tareas`.
- **Duración máxima:** 10 minutos por ejecución (`DURACION_MAXIMA_MS`); después
  se libera el lock. Sobra para el volumen del club.
- **Horarios:** viven en el workflow (cron en UTC) y cada tarea los describe
  en `horario` para mostrarlos en la pantalla.

  | Tarea | Cron (UTC) | Horario |
  |---|---|---|
  | `vencimientos-documentacion` | `0 11 * * *` | Todos los días a las 08:00 |
  | `reintentar-notificaciones` | `30 */6 * * *` | Cada 6 horas |
  | `rotacion-cuota-social` | `0 6 1 * *` | Día 1 de cada mes a las 03:00 |
  | `cierre-de-eventos` (DT-33, TASK-37) | `0 8 * * *` | Todos los días a las 05:00 |

- **Compatibilidad con US-26:** `POST /alertas/documentacion/notificar` se
  elimina (lo reemplaza la tarea `vencimientos-documentacion`). Mientras se
  migran los entornos se aceptan `ALERTAS_CRON_TOKEN` y la cabecera
  `x-cron-token` como alias de `TAREAS_TOKEN` y `x-tareas-token`.

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| `@nestjs/schedule` (cron en el proceso) | No corre con la API escalada a cero; con varias réplicas corre en todas. |
| Réplica mínima en 1 más cron interno | Consume el crédito de Azure todo el mes para trabajos de segundos, y tiene el mismo problema de duplicados si escala. |
| **Azure Container Apps Jobs** (job programado con la misma imagen) | Es la opción nativa y no despierta la API, pero suma infraestructura y configuración en Azure. Queda como evolución: con el Invoker solo hay que agregar un punto de entrada por línea de comandos. Conviene si los atrasos de GitHub (hasta unos 15 min) o su límite de minutos molestan. |
| Azure Functions / Logic Apps con temporizador | Otro servicio para mantener y pagar, para hacer lo mismo que un `curl`. |
| Un endpoint y un workflow por tarea (como US-26) | Multiplica secrets, workflows y código repetido; no hay registro común ni pantalla. |
| Cola de trabajos (BullMQ, Agenda) | Requiere Redis o un proceso siempre vivo; desproporcionado para tres tareas diarias o mensuales. |
| Lock por fila (índice único parcial «una EN_CURSO por tarea») | Prisma no modela índices parciales: quedaría en SQL fuera del schema y `prisma:check-drift` lo marcaría. El advisory lock no necesita tabla. |

## Consecuencias

**A favor**

- Sumar una tarea son **tres pasos**: una clase con `@Tarea()` en su módulo de
  dominio, registrarla como provider y agregar su cron al workflow.
- Trazabilidad: la pantalla *Tareas automáticas* muestra la última ejecución,
  el resultado y el historial, y permite ejecutar a mano.
- DT-22 queda resuelto: la rotación de la cuota social corre el día 1.
- Un solo token y un solo workflow para todo.

**En contra / a vigilar**

- GitHub Actions puede atrasar los `schedule` (hasta unos 15 minutos) y solo
  los ejecuta desde `main`. Si un repositorio público pasa 60 días sin
  actividad, GitHub desactiva los workflows programados.
- Cada ejecución despierta la API (cold start de 30 a 90 s): el workflow usa
  `--max-time 120` y reintentos.
- Una tarea larga mantiene una conexión de base abierta mientras dura (por el
  lock transaccional). Con el volumen actual no es un problema.

**Para sumar una tarea** (guía corta)

1. En el módulo de dominio, crear `mi-tarea.tarea.ts` con una clase
   `@Tarea() @Injectable()` que implemente `TareaAutomatica` y devuelva un
   resumen con contadores.
2. Agregarla a los `providers` de ese módulo.
3. En `.github/workflows/tareas-automaticas.yml`, sumar su `cron`, su caso en
   «Elegir tareas» y la opción en `workflow_dispatch`.
4. Test de la tarea (delega en el servicio y devuelve el resumen).
