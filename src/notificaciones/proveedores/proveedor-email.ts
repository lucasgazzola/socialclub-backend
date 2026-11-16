import type { ContenidoEmail } from '../notificaciones.types';

/** Token de inyección del proveedor de email activo. */
export const PROVEEDOR_EMAIL = Symbol('PROVEEDOR_EMAIL');

/**
 * Adapter (DT-36): el canal de email no conoce la librería ni el servicio que
 * entrega el correo. Hoy SMTP; mañana, por ejemplo, la API HTTP de Brevo.
 */
export interface ProveedorEmail {
  /** False si faltan los datos de conexión: no se intenta enviar. */
  readonly configurado: boolean;
  enviar(para: string, contenido: ContenidoEmail): Promise<void>;
}
