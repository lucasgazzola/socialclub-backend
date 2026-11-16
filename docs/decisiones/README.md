# Registro de decisiones de arquitectura

Cada archivo documenta **una** decisión de diseño que afecta a más de un
módulo: el contexto, qué se decidió, qué alternativas se descartaron y por
qué, y sus consecuencias. Son documentos vivos: si una decisión se reemplaza,
no se borra; se marca como *Reemplazada por* y se escribe la nueva.

| N.º | Decisión | Estado | Fecha |
|---|---|---|---|
| [0001](0001-servicio-de-notificaciones.md) | Servicio centralizado de notificaciones | Aceptada | 03/10/2026 |
| [0002](0002-servicio-de-tareas-automaticas.md) | Servicio centralizado de tareas automáticas | Aceptada | 03/10/2026 |
| [0003](0003-pasarela-de-pagos.md) | Pasarela de pagos desacoplada (Mercado Pago) | Aceptada | 31/10/2026 |
| [0004](0004-agenda-de-espacios-y-reservas.md) | Agenda de espacios y reservas | Aceptada | 01/11/2026 |
| [0005](0005-verificacion-de-email.md) | Verificación de email con enlace de un solo uso | Aceptada | 11/11/2026 |
| [0006](0006-landing-mi-club-y-panel.md) | Landing pública, portal «Mi club» y panel de gestión separados | Aceptada | 15/11/2026 |
| [0007](0007-orden-de-listados-accionables.md) | Orden de los listados que piden una acción | Aceptada | 15/11/2026 |
| [0008](0008-sin-cruce-entre-panel-y-portal.md) | El panel y Mi club no se navegan entre sí | Aceptada | 15/11/2026 |
| [0009](0009-venta-de-entradas-en-secretaria.md) | Venta de entradas en secretaría, a nombre de otra persona | Propuesta | 15/11/2026 |

## Formato

```
# NNNN · Título
- Estado: Propuesta | Aceptada | Reemplazada por NNNN
- Fecha · TASK / DT relacionadas
## Contexto        — qué problema hay y qué restricciones lo condicionan
## Decisión        — qué se hace, con los patrones aplicados
## Alternativas    — qué se descartó y por qué
## Consecuencias   — qué ganamos, qué cuesta y qué queda pendiente
```
