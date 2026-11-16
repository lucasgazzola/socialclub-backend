# Evidencia E2E · US-60

Capturas generadas por las pruebas E2E con Playwright (TASK-43) contra el sistema
real: front, API y Postgres levantados con migraciones y seed. Una captura al
final de cada paso del caso. El video y el trace de cada corrida quedan en el
reporte HTML (artifact `playwright-report` del CI).

> Generado por `socialclub-frontend/scripts/evidencia-e2e.mjs`: no editar a mano.

### TC-275 · Aprobar una solicitud: plazo para la seña y turno bloqueado

Aprobado el 01/11/2026 · `e2e/reservas.spec.ts`

  - [`TC-275-01.jpg`](TC-275-01.jpg) — 1. Como colaborador, abrir «Solicitudes de reserva»: las pendientes, por fecha del turno
  - [`TC-275-02.jpg`](TC-275-02.jpg) — 2. Aprobar RES-SEED01 y confirmar
  - [`TC-275-03.jpg`](TC-275-03.jpg) — 3. La reserva pasa a «Pendientes de pago» con el plazo de la seña

### TC-276 · Impedir aprobar una solicitud cuyo turno ya está ocupado

Aprobado el 01/11/2026 · `e2e/reservas.spec.ts`

  - [`TC-276-01.jpg`](TC-276-01.jpg) — 1. RES-SEED02 avisa que su turno se superpone con RES-SEED01
  - [`TC-276-02.jpg`](TC-276-02.jpg) — 2. Intentar aprobarla: el sistema lo impide y la solicitud sigue pendiente

### TC-277 · Rechazar una solicitud con motivo obligatorio y avisar al solicitante

Aprobado el 01/11/2026 · `e2e/reservas.spec.ts`

  - [`TC-277-01.jpg`](TC-277-01.jpg) — 1. Rechazar RES-SEED02 sin motivo: el sistema lo exige
  - [`TC-277-02.jpg`](TC-277-02.jpg) — 2. Escribir el motivo y confirmar: la solicitud queda rechazada con su motivo

### TC-279 · Pagar la seña online con la pasarela y confirmar la reserva

Aprobado el 01/11/2026 · `e2e/reservas.spec.ts`

  - [`TC-279-01.jpg`](TC-279-01.jpg) — 1. Pagar la seña de RES-SEED03: redirige a la pasarela
  - [`TC-279-02.jpg`](TC-279-02.jpg) — 2. Aprobar el pago: vuelve con el pago aprobado
  - [`TC-279-03.jpg`](TC-279-03.jpg) — 3. En «Mis reservas» la reserva quedó confirmada
