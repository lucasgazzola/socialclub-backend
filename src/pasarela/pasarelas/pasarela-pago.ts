import type {
  CobroCreado,
  NotificacionEntrante,
  PagoInformado,
  SolicitudCobro,
} from '../pasarela.types';

/** Token de inyección de la pasarela activa. */
export const PASARELA_PAGO = Symbol('PASARELA_PAGO');

/**
 * Adapter (TASK-51, decisión 0003): todo lo que SocialClub necesita de una
 * pasarela de pagos, sin saber cuál es. Hoy Mercado Pago (Checkout Pro) y una
 * simulada para desarrollo y E2E; sumar otra (Stripe, MODO, Ualá…) es otra
 * implementación de esta interfaz, sin tocar la facade ni los dominios.
 *
 * La pasarela solo cobra e informa: qué se acredita y cuándo lo decide
 * `PasarelaService`.
 */
export interface PasarelaPago {
  /** Se guarda en la orden y como método de pago (p. ej. `MERCADO_PAGO`). */
  readonly nombre: string;

  /** Genera el cobro y devuelve la URL a la que se redirige al usuario. */
  crearCobro(solicitud: SolicitudCobro): Promise<CobroCreado>;

  /** Consulta un pago por su id en la pasarela, o null si no existe. */
  consultarPago(idPagoExterno: string): Promise<PagoInformado | null>;

  /**
   * Busca el pago más relevante de una orden (el aprobado si lo hay; si no,
   * el último), o null si el usuario todavía no intentó pagar.
   */
  buscarPago(referencia: string): Promise<PagoInformado | null>;

  /**
   * Valida una notificación (firma incluida) y devuelve el id del pago
   * informado, o null si no es una notificación de pago. Lanza
   * `UnauthorizedException` si la firma no es válida.
   */
  leerNotificacion(notificacion: NotificacionEntrante): string | null;
}
