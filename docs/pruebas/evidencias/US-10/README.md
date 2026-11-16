# US-10 · Pagar cuota como socio — evidencia

## TASK-51 · Pasarela de pagos (31/10/2026)

| Evidencia | Qué muestra | Casos |
|---|---|---|
| `e2e/TC-260-01…04.jpg` | Pago de una cuota rechazado en la pasarela simulada, cancelado, y la cuota sigue pendiente (E2E automático) | TC-260 |
| `mercado-pago/00-confirmar-pago.png` | Modal «Confirmar pago» de SocialClub antes de redirigir a Mercado Pago (sin campos de tarjeta) | TC-258 |
| `mercado-pago/01-resultado-pago-aprobado.png` | Pantalla «¡Pago aprobado!» de SocialClub después de pagar en el sandbox | TC-259 |
| `mercado-pago/02-historial-metodo-mercado-pago.png` | Historial de Lucía: período 2025-02 pagado con método «Mercado Pago» | TC-259 |
| Prueba manual contra Mercado Pago (abajo) | Preferencia de Checkout Pro creada con las credenciales del vendedor de prueba y pago aprobado de punta a punta en el sandbox | TC-258, TC-259, TC-272 |

### Prueba manual contra el sandbox de Mercado Pago

Ejecutada por Gazzola Lucas el 31/10/2026 sobre la base local `socialclub_local`
(migraciones al día, seed), con `MP_ACCESS_TOKEN` del **vendedor de prueba**
(`GET /users/me` → tag `test_user`, sitio MLA):

| Paso | Resultado |
|---|---|
| Arranque de la API | Log: `Pasarela de pagos: MERCADO_PAGO · conceptos: ENTRADAS, CUOTA_SOCIAL` (sin token: `SIMULADA`) |
| `POST /api/v1/pagos/checkout` (socia Lucía, período 2025-02) | 201 · orden `PENDIENTE`, pasarela `MERCADO_PAGO`, monto 10000, `urlPago` = `https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=3808773726-…` |
| `POST /api/v1/pasarela/ordenes/:referencia/confirmar` | 200 · sigue `PENDIENTE` (todavía no hay pago en Mercado Pago: la búsqueda por `external_reference` responde vacía) |
| `POST /api/v1/pasarela/ordenes/:referencia/cancelar` | 200 · `CANCELADA` |

### Pago aprobado de punta a punta (sandbox de Mercado Pago)

Ejecutado por Gazzola Lucas el 31/10/2026 desde el front (socia Lucía), pagando
en el checkout de Mercado Pago logueado con un **comprador de prueba** y la
tarjeta Mastercard de prueba (titular `APRO`):

| Paso | Resultado |
|---|---|
| «Pagar seleccionadas» → «Ir a pagar» (período 2025-02) | Redirige a `www.mercadopago.com.ar/checkout/v1/payment/redirect/?preference-id=3808773726-…` (preferencia del vendedor de prueba) |
| Pago en Mercado Pago | «¡Listo! Tu pago ya se acreditó» · pago `187164881448`, `approved · accredited`, $10.000, Mastercard |
| Vuelta a `/pagos/resultado?referencia=…&payment_id=187164881448` | «¡Pago aprobado!» · orden `APROBADA` con `idPagoExterno` 187164881448 |
| Base de datos | `pagos`: período 2025-02, $10.000, método `MERCADO_PAGO`, con `ordenPagoId` de la orden |

**Observación:** en local Mercado Pago no vuelve solo al sitio (`auto_return`
exige https) ni puede llamar al webhook (la API no es pública): hay que tocar
«Volver al sitio». En test y main (https) vuelve solo y el webhook acredita
aunque el usuario cierre la pestaña. Respalda TC-258 y TC-259 (EJ-292 y EJ-293).

**Pantallas del checkout de Mercado Pago:** no se pudieron capturar automáticamente
(Mercado Pago bloquea los navegadores automatizados). Se agregan como
`mercado-pago/1x-*.png` cuando se capturen a mano en una prueba.
