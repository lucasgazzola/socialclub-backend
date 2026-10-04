# Evidencia · US-21 — Registrar pago de cuota deportiva

## DT-41 · Reinscribirse no pierde la deuda anterior (04/10/2026)

Corrida contra la API local (rama
`issue/TASK-41-DT-41-Historial-de-periodos-de-inscripcion`) sobre una base con
todas las migraciones y el seed. La migración `20261004220000_periodos_de_inscripcion`
crea un período por cada inscripción existente (backfill).

| Archivo | Qué muestra | Casos |
|---|---|---|
| `dt41-api.txt` | Períodos de la inscripción antes y después de reinscribir, la deuda resultante y el rechazo de un mes sin inscripción | TC-178, TC-179 |

Tests: `src/pagos/pagos-deportivos.service.spec.ts` (bloque «DT-41») y
`src/inscripcion/inscripcion.service.spec.ts` (bloque «DT-41»).
