# Evidencia · US-23 — Ver morosos de cuota deportiva

Corrida del 10/10/2026 contra la API y el frontend locales (ramas
`feature/US-23-Ver-morosos-cuota-deportiva`), con la base cargada por el seed.
**Hoy es 10/10**: la cuota de octubre todavía no venció (vence el día 10 y es
deuda desde el 11), así que el último período adeudado de cada moroso es 09/2026.

**Datos agregados para la evidencia:** el seed no tiene a nadie que deba en más
de dos disciplinas. A Valeria (60000006), que ya debía Fútbol Femenino y Pelota
Paleta, se la inscribió por la API en Natación y Gimnasio y se fecharon esas
inscripciones al 01/08/2026 en la base de pruebas, para que tengan cuotas
vencidas.

| Archivo | Qué muestra | Casos |
|---|---|---|
| `01-listado.jpg` | Listado como colaborador: resumen (6 morosos, deuda vencida total) y, por moroso, nombre, DNI, deuda por disciplina (una línea cada una), períodos y total. Valeria debe en 4 disciplinas: la fila muestra 2 y «+2 disciplinas más», sin crecer | TC-200, TC-201, TC-208 |
| `02-detalle.jpg` | Detalle de Valeria abierto desde «+2 disciplinas más»: las 4 disciplinas por separado, cada cuota con período, vencimiento (día 10), importe y estado «Vencida · impaga»; Pelota Paleta marcada «Dada de baja» | TC-202, TC-208, TC-209 |
| `03-filtro-natacion.jpg` | Filtro por disciplina «Natación»: solo esos morosos y solo su deuda de Natación (Valeria figura con $25.600, no con su total) | TC-205 |
| `04-orden-periodos.jpg` | Orden «Menos períodos adeudados» | TC-207 |
| `05-busqueda-dni.jpg` | Búsqueda por DNI (90000009) | TC-206 |
| `06-cobrar-desde-morosos.jpg` | «Cobrar» abre el cobro con el DNI cargado y buscado (como ADMIN; ver nota) | TC-211 |
| `api.txt` | Respuestas reales del endpoint: listado, filtro y orden, 403 del delegado y 400 de validación | TC-200, TC-205, TC-207, TC-210 |

**Cobro vs. morosos:** en el cobro (US-21) el total de Valeria incluye octubre,
que se puede pagar por adelantado; en morosos no, porque todavía no venció.

**Nota sobre el cobro como colaborador:** hasta que se mergee TASK-43
(socialclub-backend#89), `GET /personas/dni/:dni` responde 403 al COLABORADOR y
el cobro no encuentra al participante. Por eso la captura 06 es como ADMIN.

**E2E (Playwright, sistema real):** `socialclub-frontend/e2e/morosos-cuota-deportiva.spec.ts`
corre TC-201, TC-208, TC-210 y TC-211 contra el front, la API y Postgres con el
seed, ya con el permiso de búsqueda por DNI de TASK-43: «Cobrar» funciona como
COLABORADOR. Capturas por paso en [`e2e/`](e2e/README.md); ejecuciones
EJ-173 a EJ-176.

Tests automatizados: `src/pagos/pagos-deportivos-morosos.service.spec.ts`,
`src/pagos/vencimiento-cuota-deportiva.spec.ts` y
`src/pagos/pagos-deportivos.roles.spec.ts` (backend);
`MorososCuotaDeportivaPage.test.tsx`, `RegistrarPagoDeportivoPage.test.tsx` y
`pagos.api.test.ts` (frontend).
