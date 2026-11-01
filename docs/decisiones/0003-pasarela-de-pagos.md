# 0003 · Pasarela de pagos desacoplada (Mercado Pago)

- **Estado:** Aceptada
- **Fecha:** 31/10/2026 · **TASK-51** · DT-31 (compra real de entradas), DT-35 (autoservicio)
- **Código:** `src/pasarela/` · acreditadores en `src/pagos/` y `src/entradas/`

## Contexto

El usuario pagaba en dos lugares y en ninguno se cobraba de verdad:

| Dónde | Antes |
|---|---|
| **Mis cuotas** (US-10): el socio paga su cuota social | Formulario de tarjeta simulado; `POST /pagos/registrar` marcaba los períodos como pagos sin cobrar nada. Cualquier socio podía "pagar" sin pagar. |
| **Comprar entradas** (US-52) | Formulario de tarjeta simulado; `POST /entradas/comprar` generaba las entradas sin cobrar. |

Hay otros dos lugares donde aparece dinero que **no** pasan por una pasarela:

- **Secretaría** (US-17 cuota social, US-21 cuota deportiva): registra un cobro en ventanilla (efectivo, transferencia). Sigue igual.
- **Seña de reservas de espacios** (US-59/60, Sprint 6): todavía no existe y tiene que poder sumarse sin tocar la pasarela.

Se pidió integrar **Mercado Pago en modo prueba**, para mostrar un pago simulado de punta a punta, con un diseño **adaptable a cualquier otra pasarela** y basado en interfaces.

Restricciones:

- La API escala a cero en Azure Container Apps: no puede haber nada esperando en memoria a que llegue un pago.
- En local la API no es accesible desde internet, así que Mercado Pago no puede avisarle por webhook.
- Los E2E (TASK-43) corren sin internet hacia Mercado Pago y tienen que seguir probando el flujo completo.
- Nunca tocar datos de tarjeta (PCI): por eso se usa **Checkout Pro**, donde el usuario paga en la página de Mercado Pago.

## Decisión

Un módulo `pasarela` con una facade, `PasarelaService`, y **dos interfaces**: una para la pasarela (cómo se cobra) y otra para cada dominio (qué significa que se cobró).

```
Dominio (pagos, entradas, reservas…)
   │  iniciarCobro({ concepto, items, datos, reservar })
   ▼
PasarelaService (Facade) ──── tabla ordenes_pago (orden primero, idempotencia)
   │                    │
   │                    └─ ACREDITADORES (Registry por @Acreditador())
   │                         ├─ CuotaSocialAcreditador   (src/pagos)
   │                         └─ EntradasAcreditador      (src/entradas)
   ▼
PasarelaPago (interfaz, token PASARELA_PAGO)
   ├─ PasarelaMercadoPago  (Checkout Pro, API REST con fetch)
   └─ PasarelaSimulada     (sin credenciales: desarrollo y E2E)
```

### El circuito de un pago

1. **Iniciar.** El dominio valida y cotiza (`POST /pagos/checkout`, `POST /entradas/checkout`) y llama a `iniciarCobro`. La facade, en **una** transacción, ejecuta `reservar` (p. ej. descuenta el cupo de entradas) y crea la `OrdenPago` en estado `PENDIENTE` con todo lo necesario para acreditar (`datos`). Después crea el cobro en la pasarela y devuelve `urlPago`. Si la pasarela falla, la orden se cancela y se libera lo reservado.
2. **Pagar.** El front redirige a `urlPago`: el checkout de Mercado Pago o el simulador. La `referencia` de la orden (UUID) viaja como `external_reference`.
3. **Confirmar.** El pago llega por dos caminos, y los dos terminan en el mismo método (`aplicarPago`):
   - **Vuelta del usuario:** Mercado Pago redirige a `/pagos/resultado?referencia=…&payment_id=…` y el front llama a `POST /pasarela/ordenes/:referencia/confirmar`.
   - **Webhook:** `POST /api/v1/pasarela/webhook` (solo si la API es pública y hay `API_PUBLIC_URL`).

   En los dos casos **se consulta el estado a la pasarela**: ni la URL ni el cuerpo del webhook valen como prueba de pago.
4. **Acreditar.** Con el pago aprobado, la orden pasa a `APROBADA` con un `updateMany` condicionado al estado anterior, y en la **misma transacción** el acreditador del concepto crea los registros del dominio (`Pago` por período o `CompraEntrada` con sus entradas). Si el webhook y la vuelta llegan a la vez, solo uno acredita.
5. **Cerrar sin pago.** Un rechazo **no** cierra la orden (en Checkout Pro el usuario puede reintentar con otra tarjeta). El usuario puede cancelarla, o la tarea `vencer-ordenes-pago` la vence a los 30 minutos. En los dos casos se libera lo reservado, pero antes se pregunta a la pasarela: si el pago entró y el aviso se perdió, se acredita.

### Estados de una orden

| Estado | Cuándo |
|---|---|
| `PENDIENTE` | Creada, esperando el pago (incluye pagos rechazados que el usuario puede reintentar) |
| `APROBADA` | Pago aprobado y acreditado |
| `CANCELADA` | El usuario desistió, la reemplazó por otra o la pasarela no pudo crear el cobro |
| `VENCIDA` | Pasaron 30 minutos sin pago |
| `REQUIERE_REVISION` | **Se cobró pero no se pudo acreditar** (p. ej. secretaría cobró el mismo período mientras tanto, o la orden venció y el cupo se agotó). Queda auditado y hay que devolver el dinero a mano. |

### Patrones aplicados

| Patrón | Dónde | Por qué |
|---|---|---|
| **Adapter** | `PasarelaPago` (`pasarelas/pasarela-pago.ts`); `PasarelaMercadoPago` y `PasarelaSimulada` | La facade y los dominios no saben qué pasarela hay. Cambiar Mercado Pago por Stripe, MODO o Ualá es otra implementación de cinco miembros. |
| **Strategy** | `AcreditadorCobro` (`acreditadores/acreditador-cobro.ts`) | Cada dominio decide qué significa "se aprobó el pago" (crear pagos, generar entradas, confirmar una reserva) y cómo liberar lo reservado. |
| **Registry** (descubrimiento) | `@Acreditador()` + `DiscoveryService` | Como `@Tarea()` (decisión 0002): `pasarela` no importa ningún dominio. Sumar un concepto no modifica el módulo. |
| **Facade** | `PasarelaService` | Los dominios solo conocen `iniciarCobro` (y `cancelarPendientes`). |
| **Factory** | `elegirPasarela` en `PasarelaModule` | Elige la pasarela por configuración: `PASARELA_PAGOS`, o Mercado Pago si hay token, o la simulada. |
| **Orden primero + idempotency key** | tabla `ordenes_pago`, `referencia` como `external_reference` y `X-Idempotency-Key` | Un pago siempre encuentra qué acreditar, aunque llegue por webhook horas después o la API se haya reiniciado. |
| **Optimistic lock** | `updateMany({ where: { id, estado } })` | Evita acreditar dos veces sin bloquear filas. |

### Decisiones de detalle

- **Sin SDK de Mercado Pago:** son tres llamadas REST (`POST /checkout/preferences`, `GET /v1/payments/:id`, `GET /v1/payments/search`). Con `fetch` el adapter es el único archivo que conoce a Mercado Pago y se testea simulando `fetch`.
- **Sandbox por el token:** con un Access Token `TEST-…` se redirige a `sandbox_init_point`; con uno `APP_USR-…`, a `init_point`. Las credenciales `APP_USR-…` de un **usuario de prueba** (vendedor de prueba) también son de prueba: no mueven dinero real. Para verificar de quién es un token: `GET https://api.mercadopago.com/users/me` debe traer el tag `test_user`.
- **`auto_return` solo con https:** Mercado Pago lo rechaza con URLs `http://localhost`. En local el usuario vuelve con el botón «Volver al sitio».
- **Sin email del pagador:** en el sandbox, un email que no es de un usuario de prueba hace fallar el pago.
- **Firma del webhook:** con `MP_WEBHOOK_SECRET` se valida `x-signature` (HMAC-SHA256 de `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`). Sin el secreto no se valida, y no hace falta: el estado se consulta igual a la API.
- **Monto 0:** una orden sin costo (p. ej. entradas gratuitas con cupo) se acredita al crearla, sin pasar por la pasarela (`pasarela = SIN_COSTO`).
- **Cuota social:** iniciar un pago cancela la orden pendiente anterior del socio, para que no queden dos órdenes por los mismos períodos. El acreditador vuelve a verificar que ningún período se haya pagado mientras tanto.
- **Entradas:** el cupo se **reserva al iniciar** (no al aprobar), así no se vende de más mientras el usuario está en Mercado Pago. Una orden vencida que después se paga intenta volver a reservar; si no hay cupo, queda en revisión.
- **Método de pago:** `Pago.metodoPago` y `CompraEntrada.metodoPago` guardan el nombre de la pasarela (`MERCADO_PAGO`, `SIMULADA`) y los dos tienen `ordenPagoId` para la trazabilidad.
- **Auditoría:** se registra crear (`CREAR OrdenPago`), aprobar (`EDITAR`), cancelar o vencer (`BAJA`), y cada `Pago` o `CompraEntrada` acreditado.
- **Se eliminaron** `POST /pagos/registrar` y `POST /entradas/comprar` (los simulados): dejaban acreditar sin cobrar. El cobro de secretaría (`POST /pagos/socio/:id`, `POST /pagos-deportivos/persona/:id`) no cambia.

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| **Checkout Bricks / Checkout API** (formulario embebido) | Acopla el front al SDK de Mercado Pago y acerca los datos de tarjeta a nuestra app. Checkout Pro es más simple, más seguro y más fácil de reemplazar. |
| **SDK oficial `mercadopago`** | Suma una dependencia para tres llamadas. Igual quedaría encerrado en el adapter. |
| **Acreditar con la URL de vuelta** (`status=approved`) | El usuario puede escribir esa URL a mano. Siempre se consulta a la pasarela. |
| **Solo webhook** | En local y en los E2E la API no es pública. La vuelta del usuario cubre ese caso y el webhook cubre al que cierra la pestaña. |
| **Una tabla de pagos genérica que reemplace `Pago` y `CompraEntrada`** | Rompe reportes, morosos e historial ya hechos. La orden es la capa común y cada dominio conserva su modelo. |
| **Eventos de dominio** (`@nestjs/event-emitter`) para avisar "se pagó" | Un evento en memoria se pierde si el proceso cae justo después de cobrar. El acreditador corre en la misma transacción que cambia el estado de la orden. |
| **Mantener los endpoints simulados en paralelo** | Dejaba abierto acreditar sin cobrar. La pasarela simulada cubre desarrollo y E2E con el mismo circuito que la real. |

## Consecuencias

**A favor**

- Cambiar de pasarela es implementar `PasarelaPago` y registrarla en `elegirPasarela`. Los dominios y el front no cambian (el front solo redirige a `urlPago`).
- Un cobro nuevo (seña de reservas, cuota deportiva del socio, merchandising) es un endpoint de checkout en su dominio y un `@Acreditador()`.
- Nadie puede acreditar sin pagar, y ningún pago aprobado se pierde: queda acreditado o en `REQUIERE_REVISION`, siempre auditado.
- Los E2E prueban el circuito completo con la pasarela simulada.

**En contra / a vigilar**

- `REQUIERE_REVISION` necesita intervención manual (devolver desde el panel de Mercado Pago). No hay pantalla para listarlas: se consultan en la tabla `ordenes_pago` o en la auditoría. Pendiente si se vuelve frecuente.
- Las devoluciones y la cancelación de entradas siguen sin implementarse (DT-34).
- Una orden de entradas retiene el cupo hasta 30 minutos más lo que tarde la tarea horaria en vencerla.
- La pasarela simulada guarda los pagos en memoria: con más de una réplica, el simulador podría no ver un pago. Solo se usa en desarrollo, E2E y entornos sin credenciales.

**Para sumar un cobro nuevo** (p. ej. la seña de una reserva, US-60)

1. Agregar el valor al enum `ConceptoCobro` (con su migración).
2. En el dominio, `ReservaAcreditador implements AcreditadorCobro` con `@Acreditador()`: `acreditar` confirma la reserva; `liberar` libera el turno.
3. Un endpoint de checkout que valide, cotice y llame a `pasarela.iniciarCobro({ concepto: 'RESERVA', items, datos, reservar })`.
4. En el front, redirigir a `urlPago`. La vuelta ya la resuelve `/pagos/resultado`.

**Para sumar otra pasarela**

1. `PasarelaX implements PasarelaPago`: `crearCobro`, `consultarPago`, `buscarPago`, `leerNotificacion`.
2. Agregarla a `providers` de `PasarelaModule` y un caso en `elegirPasarela` (y su valor en `PASARELA_PAGOS`).

## Guía: Mercado Pago en modo prueba

**Sin hacer nada** la API usa la pasarela **simulada**: al pagar se abre el «Simulador de pago» del front con los botones *Aprobar* y *Rechazar*.

Para pagar en el **sandbox de Mercado Pago**:

1. Entrar a <https://www.mercadopago.com.ar/developers/panel/app> con una cuenta de Mercado Pago y **crear una aplicación** (*Pagos online* → *Checkout Pro*).
2. En la aplicación, **Credenciales de prueba** → copiar el **Access Token** (`TEST-…`).
   Si el panel ya no ofrece credenciales de prueba: en **Cuentas de prueba** crear un usuario **vendedor**, entrar con él (ventana de incógnito), crear la aplicación ahí y usar sus credenciales de producción (`APP_USR-…`): al ser de una cuenta de prueba, no cobran dinero real. Así está configurado el equipo (31/10/2026).
3. En **Cuentas de prueba** crear un usuario **comprador**. Se paga logueado con ese usuario, no con tu cuenta real (con tu cuenta, Mercado Pago responde «una de las partes es de prueba»).
4. En el `.env` del backend:
   ```
   MP_ACCESS_TOKEN=TEST-…   # o el APP_USR-… del vendedor de prueba
   ```
   y reiniciar la API. El log muestra `Pasarela de pagos: MERCADO_PAGO`.
5. Pagar con una **tarjeta de prueba**. El **nombre del titular** decide el resultado:

   | Tarjeta | Número | CVV | Vencimiento |
   |---|---|---|---|
   | Mastercard | 5031 7557 3453 0604 | 123 | 11/30 |
   | Visa | 4509 9535 6623 3704 | 123 | 11/30 |
   | American Express | 3711 803032 57522 | 1234 | 11/30 |

   | Titular | Resultado |
   |---|---|
   | `APRO` | Aprobado |
   | `OTHE` | Rechazado (error general) |
   | `CONT` | Pendiente |
   | `FUND` | Rechazado (fondos insuficientes) |

   DNI: `12345678`. Email: el del comprador de prueba.
6. **En los entornos desplegados** (test, main): cargar los secrets de GitHub `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET` y `API_PUBLIC_URL` (URL pública de la API, sin `/api/v1`). Los workflows de CD los pasan al Container App. Para el webhook: en la aplicación de Mercado Pago, **Webhooks** → URL `https://<api>/api/v1/pasarela/webhook`, evento **Pagos**, y copiar la **clave secreta** a `MP_WEBHOOK_SECRET`.
