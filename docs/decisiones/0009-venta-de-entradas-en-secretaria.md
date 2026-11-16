# 0009 · Venta de entradas en secretaría, a nombre de otra persona

- **Estado:** Propuesta (15/11/2026). No implementada.
- **Se apoya en:** [0003](0003-pasarela-de-pagos.md) (la compra online no se acredita sin la pasarela), [0001](0001-servicio-de-notificaciones.md) (el mail sale de `NotificacionesService`), [0008](0008-sin-cruce-entre-panel-y-portal.md) (el botón «Comprar entradas» del panel no es esta venta).

## Qué hay hoy

No se puede. Ni la API ni el panel venden una entrada a nombre de otra persona, ni la mandan a un email que no sea el de una cuenta.

Hay dos caminos, y ninguno es este caso.

**Compra online, `POST /entradas/checkout`.** Cualquier usuario con sesión. Cotiza para ese usuario (descuento de socio si él lo es), reserva el cupo y devuelve la URL de Mercado Pago. Las entradas nacen cuando la pasarela confirma, en `EntradasAcreditador`: una `CompraEntrada` con `usuarioId` obligatorio, una `Entrada` con token por unidad, y un mail de confirmación a ese usuario. El mail (`CompraEntradasPlantilla`) lista evento, fecha, lugar, cantidad y montos. No lleva el QR. El QR se ve en Mi club, en «Mis entradas». No hay campo para otro destinatario ni para otro medio de pago.

**Generar entradas, `POST /entradas`.** Solo `ADMIN`. Crea N entradas con token y descuenta el cupo. No crea `CompraEntrada`, no las asigna a nadie y no manda mail. El front tiene el cliente (`entradasApi.crearEntradas`) y el hook, y ninguna pantalla los usa.

El parecido que sí existe es el cobro de cuota en secretaría: `POST /pagos/socio/:id` (`ADMIN` y `COLABORADOR`) registra efectivo, transferencia, débito o crédito y acredita en el momento, sin pasar por la pasarela. La pantalla está en `/admin/cuotas/social/morosos`. Eso no toca entradas.

`CompraEntrada.usuarioId` es obligatorio y apunta a `Usuario`. `NotificacionesService.notificar` solo acepta ids de usuario y les manda el mail al email de esa cuenta. En la tabla `notificaciones`, `usuarioId` ya es opcional y `destino` guarda el email: el hueco está en el servicio, no en la tabla.

## Decisión

La secretaría puede vender una o más entradas desde el panel, cobrando ahí, con el mismo resultado que si esa compra se hubiera acreditado por Mercado Pago. El medio no es Mercado Pago: la plata ya se recibió, igual que en la cuota social.

Dos compradores, una sola operación:

1. **Alguien cargado, con cuenta.** Se elige de los socios o participantes que tienen usuario. La compra queda con su `usuarioId`, así la ve en Mi club. El precio usa la misma regla que `cotizarCompra`: descuento de socio si esa persona es socia, precio lleno si no. El mail de la entrada sale a la casilla de su cuenta. El admin no es el comprador aunque sea él quien opera.
2. **Alguien que no está cargado, o que está cargado pero no tiene usuario.** No se le crea una cuenta para poder venderle. Se escribe el email dos veces y tienen que coincidir. Si la ficha tiene email, se ofrece como valor inicial y igual hay que confirmarlo. La compra no lleva `usuarioId`. El mail, con el QR, va a esa casilla. En la puerta la entrada se valida por el token, como cualquier otra: no hace falta que el portador tenga sesión.

En los dos casos el mail lleva un QR por entrada. Hoy el mail de la compra online no lo lleva. Para que los dos canales entreguen lo mismo, la plantilla de `COMPRA_ENTRADAS` pasa a incluir los QR también cuando acredita Mercado Pago. Quien compró online sigue viendo las entradas en Mi club; el mail deja de ser solo el recibo.

El cobro se acredita en el momento: se descuenta el cupo, se crea la `CompraEntrada` y las entradas `VALIDA`, se audita con el id del operador (no del comprador) y se encola el mail. Medios: `EFECTIVO`, `TRANSFERENCIA`, `DEBITO`, `CREDITO`, los mismos de `RegistrarPagoSocioDto`. No se llama a `PasarelaService`: no hay una orden que la pasarela tenga que confirmar. Es el mismo criterio que US-17.

Quién puede vender: `ADMIN` y `COLABORADOR`, como el cobro de cuota. El delegado no.

En la pantalla de eventos del panel la acción se llama «Registrar venta», no «Comprar entradas». «Comprar entradas» sigue siendo la compra del propio socio en Mi club (0008). Antes de confirmar se muestra la cantidad, el precio unitario, el total y si se aplicó el descuento.

## Qué hay que cambiar cuando se implemente

- `CompraEntrada.usuarioId` pasa a ser opcional. Hace falta una migración. Para el caso sin cuenta, un email del comprador en la compra (el que se escribió dos veces).
- Un endpoint nuevo, aparte de `POST /entradas` y de `POST /entradas/checkout`. El primero seguiría creando entradas sueltas sin dueño; no se reutiliza para no mezclar «imprimir stock» con «vender».
- `NotificacionesService` gana una forma de avisar a un email sin usuario, siempre por el outbox (`destino` + `usuarioId` nulo). El módulo de entradas no manda el mail por su cuenta.
- La plantilla suma los tokens (o el QR armado a partir del token) y el acreditador online se los pasa. Un QR por unidad, que es la regla que ya usa la puerta.
- Front: modal en `/admin/eventos`. Buscador de personas con usuario, y la alternativa «no está registrado» con email y confirmación. El precio mostrado sale del backend.

## Alternativas

- **Que el admin entre a Mi club y compre con Mercado Pago.** Compra a su nombre, no al de quien llamó, y lo saca del panel. Es el salto de 0008. Se descarta.
- **Crear un usuario fantasma para el que no está registrado**, así entra en `usuarioId` y en `notificar`. Aparece en el padrón de usuarios, hay que inventarle una contraseña y no es lo que pidió. Se descarta.
- **Reusar `POST /entradas`.** Esas entradas no tienen compra ni dueño ni mail. Quedarían inutilizables para quien llamó por teléfono. Se descarta.
- **Cobrar esta venta con la pasarela.** Quien llama ya pagó en efectivo o por transferencia. Mandarlo a Mercado Pago no registra ese cobro. Se descarta, con la misma salvedad que US-17 respecto de 0003.

## Consecuencias

- Quien no tiene cuenta recibe la entrada solo por mail. Si el mail rebota, no tiene Mi club donde verla. El reintento queda en el outbox, como el resto de los avisos.
- La compra online también empieza a mandar el QR en el mail. Es el mismo comprobante para los dos canales.
- El cupo baja en el momento. No hay reserva ni vencimiento de orden, porque no hay pago pendiente.
- Nada de esto está implementado. 0008 sigue sacando «Comprar entradas» del panel; esta venta es otra acción.
