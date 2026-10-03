# Registro de decisiones de arquitectura

Cada archivo documenta **una** decisión de diseño que afecta a más de un
módulo: el contexto, qué se decidió, qué alternativas se descartaron y por
qué, y sus consecuencias. Son documentos vivos: si una decisión se reemplaza,
no se borra; se marca como *Reemplazada por* y se escribe la nueva.

| N.º | Decisión | Estado | Fecha |
|---|---|---|---|
| [0001](0001-servicio-de-notificaciones.md) | Servicio centralizado de notificaciones | Aceptada | 03/10/2026 |
| [0002](0002-servicio-de-tareas-automaticas.md) | Servicio centralizado de tareas automáticas | Aceptada | 03/10/2026 |

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
