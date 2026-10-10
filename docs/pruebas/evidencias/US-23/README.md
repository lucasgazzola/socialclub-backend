# Evidencia · US-23 — Ver morosos de cuota deportiva

Corrida del 10/10/2026 contra la API y el frontend locales (ramas
`feature/US-23-Ver-morosos-cuota-deportiva`), con la base cargada por el seed.
**Hoy es 10/10**: la cuota de octubre todavía no venció (vence el día 10 y es
deuda desde el 11), así que el último período adeudado de cada moroso es 09/2026.

| Archivo | Qué muestra | Casos |
|---|---|---|
| `01-listado.jpg` | Listado como colaborador: resumen (6 morosos, deuda vencida total), y por moroso nombre, DNI, deuda por disciplina, períodos y total. Valeria debe Fútbol Femenino y Pelota Paleta (dada de baja) por separado | TC-200, TC-201, TC-208, TC-209 |
| `02-detalle.jpg` | Detalle desplegado: cada cuota con período, vencimiento (día 10), importe y estado «Vencida · impaga», por disciplina | TC-202, TC-208 |
| `03-filtro-natacion.jpg` | Filtro por disciplina «Natación»: solo esos morosos y su deuda de Natación | TC-205 |
| `04-orden-periodos.jpg` | Orden «Menos períodos adeudados» | TC-207 |
| `05-busqueda-dni.jpg` | Búsqueda por DNI (90000009) | TC-206 |
| `06-cobrar-desde-morosos.jpg` | «Cobrar» abre el cobro con el DNI cargado y buscado (como ADMIN; ver nota) | TC-211 |
| `api.txt` | Respuestas reales del endpoint: listado, filtro y orden, 403 del delegado y 400 de validación | TC-200, TC-205, TC-207, TC-210 |

**Cobro vs. morosos:** en el cobro (US-21) el total de Valeria incluye octubre,
que se puede pagar por adelantado; en morosos no, porque todavía no venció.

**Nota sobre el cobro como colaborador:** hasta que se mergee TASK-43
(socialclub-backend#89), `GET /personas/dni/:dni` responde 403 al COLABORADOR y
el cobro no encuentra al participante. Por eso la captura 06 es como ADMIN.

Tests automatizados: `src/pagos/pagos-deportivos-morosos.service.spec.ts`,
`src/pagos/vencimiento-cuota-deportiva.spec.ts` y
`src/pagos/pagos-deportivos.roles.spec.ts` (backend);
`MorososCuotaDeportivaPage.test.tsx`, `RegistrarPagoDeportivoPage.test.tsx` y
`pagos.api.test.ts` (frontend).
