import type { CanalNotificacion } from '@prisma/client';
import type { Destinatario } from '../notificaciones.types';

/** Token de inyección con la lista de canales registrados. */
export const CANALES = Symbol('CANALES_NOTIFICACION');

/**
 * Strategy (DT-36): un canal por el que sale una notificación. Para sumar push
 * o la bandeja interna se implementa esta interfaz y se registra en
 * `NotificacionesModule`; quien notifica no cambia.
 */
export interface Canal {
  readonly tipo: CanalNotificacion;
  /** False si al canal le falta configuración: la notificación queda pendiente. */
  disponible(): boolean;
  /** Dirección del destinatario en este canal, o null si no tiene. */
  destinoDe(destinatario: Destinatario): string | null;
  enviar(destino: string, contenido: unknown): Promise<void>;
}
