# 0004 · Agenda de espacios y reservas

- **Estado:** Aceptada
- **Fecha:** 01/11/2026 · **TASK-52** · base de US-55 a US-62 (épica E14)
- **Código:** `prisma/schema.prisma` (`Espacio`, `EspacioDisciplina`, `BloqueoAgenda`, `Reserva`) · `src/reservas/agenda.ts`

## Contexto

El Sprint 6 suma el alquiler de espacios: alta de espacios con bloqueos de agenda (US-55 a US-58), solicitud de reserva (US-59), evaluación (US-60), cancelación (US-61) y «Mis Reservas» (US-62). Las historias están repartidas entre varios integrantes y todas tocan lo mismo: qué está ocupado en la agenda de un espacio.

Si cada historia resolviera la ocupación por su lado, una solicitud podría aceptar un turno que la evaluación después considera ocupado, o un bloqueo podría no ver una reserva aprobada. Por eso el modelo y las reglas se fijan primero, en una tarea propia.

Reglas de negocio de la épica (doc «Notas / Deuda técnica» del equipo):

- **RN-ESP01:** una actividad confirmada en un espacio compartido lo ocupa entero, para todas las disciplinas.
- **RN-ESP02:** las actividades fijas del club y los eventos tienen prioridad sobre los alquileres.
- **RN-ESP03:** cada espacio se reserva por hora/turno o por día completo.
- **RN-ESP04:** toda solicitud, aprobación, rechazo o cancelación se audita.
- **RN-ESP05:** la baja de un espacio es lógica.

## Decisión

### Modelo

| Tabla | Para qué |
|---|---|
| `espacios` | Nombre, tipo (`DEPORTIVO`, `SOCIAL`, `MULTIUSO`), capacidad, modalidad (`POR_HORA`, `DIA_COMPLETO`), ubicación, tarifa (`precio`, por hora o por día), tarifa de socio (`precioSocio`, opcional), seña y `activo` (baja lógica). |
| `espacios_disciplinas` | Disciplinas compatibles con un espacio deportivo o multiuso. |
| `bloqueos_agenda` | Actividades del club: `RECURRENTE` (días de la semana, horas y vigencia, opcionalmente de una disciplina) o `PUNTUAL` (una fecha). Sin horas = día completo. |
| `reservas` | Alquiler: código de seguimiento, espacio, solicitante, `inicio`/`fin`, estado, si se aplicó tarifa de socio, montos pactados, límite y pago de la seña, quién evaluó o canceló y por qué. |

### Estados de una reserva

```
PENDIENTE_APROBACION ──aprobar (US-60)──► APROBADA_PENDIENTE_PAGO ──pago de la seña──► CONFIRMADA
        │                                          │                                     │
        └─rechazar (US-60)─► RECHAZADA              ├─vence la seña (US-61)─► CANCELADA_FALTA_PAGO
                                                    │                                     │
        usuario, antes del plazo (US-61) ─────────► CANCELADA_USUARIO ◄───────────────────┤
        administración, con motivo (US-61) ───────► CANCELADA_INSTITUCION ◄───────────────┘
```

### Reglas de la agenda (`src/reservas/agenda.ts`)

- **Qué ocupa un turno:** las reservas `APROBADA_PENDIENTE_PAGO` y `CONFIRMADA`, y los bloqueos activos. **Una solicitud pendiente no bloquea**: el turno se bloquea al aprobarla (US-60), y la aprobación vuelve a verificar que siga libre. Así dos usuarios pueden pedir el mismo turno y la administración elige.
- **Solapamiento:** intervalos semiabiertos `[inicio, fin)`. Un turno que empieza cuando termina otro no choca.
- **Espacio compartido (RN-ESP01):** la ocupación se calcula por espacio, sin importar la disciplina.
- **Horas:** las reservas se guardan como instantes (UTC). Los bloqueos se cargan en hora de reloj del club (`"HH:MM"`) y se convierten con `HUSO_CLUB_MINUTOS` (Argentina, UTC−3, sin horario de verano). Un día completo va de 00:00 a 24:00 hora argentina.
- **Montos pactados:** la reserva guarda `montoTotal` y `montoSena` al solicitarse. Si después cambia la tarifa del espacio (US-56), las reservas existentes conservan los suyos.
- **Código de seguimiento:** `RES-XXXXXX`, sin caracteres confundibles (0/O, 1/I), para dictarlo por teléfono.

Las funciones (`seSolapan`, `intervalosDeBloqueo`, `conflictosDe`, `diaCompleto`, `instanteClub`, `fechaClub`, `generarCodigoReserva`) son puras: cada historia trae de la base las reservas y bloqueos del espacio y les pregunta.

### Cobro de la seña

Se paga **online** con la pasarela de pagos (decisión [0003](0003-pasarela-de-pagos.md), concepto `RESERVA` con su acreditador) o la **registra secretaría** en ventanilla. En los dos casos la reserva pasa a `CONFIRMADA`. Se implementa con US-60.

### Plazos

- **Límite para pagar la seña** (US-60): 48 h desde la aprobación (el ejemplo de la historia).
- **Plazo de penalización** (US-61): hasta cuántas horas antes del turno el usuario puede cancelar solo. Configurable, 48 h por defecto.

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| Que una solicitud pendiente bloquee el turno | Un pedido que nunca se evalúa dejaría el turno tomado; la historia dice que se bloquea «definitivamente» al aprobar. |
| Turnos fijos predefinidos (tabla de franjas) | Las historias piden «rango horario deseado». Con `inicio`/`fin` libres, una grilla de turnos se puede sumar después como restricción. |
| Expandir los bloqueos recurrentes en filas por fecha | Multiplica filas y hay que regenerarlas al editar. Se expanden al consultar, dentro del rango pedido. |
| Guardar las reservas en hora local | Mezcla husos con el resto del sistema, que guarda instantes. La hora local solo existe en los bloqueos, que son de reloj. |
| Una tabla de estados de reserva con historial | La auditoría (RN-ESP04) ya registra cada cambio de estado con responsable y fecha. |

## Consecuencias

**A favor**

- Las historias de la épica pueden avanzar en paralelo sobre el mismo modelo y las mismas reglas.
- La ocupación se prueba sin base de datos (`agenda.spec.ts`).

**A vigilar**

- La verificación «el turno sigue libre» al aprobar no está protegida por una restricción de la base. Si dos administradores aprobaran a la vez reservas que se pisan, podrían entrar las dos. Con el volumen de un club es improbable; si pasara, se puede sumar un lock por espacio (`SELECT … FOR UPDATE` sobre el espacio) en la aprobación.
- Las fotos de los espacios (US-58) dependen de resolver DT-15 (adjuntos en Azure).
