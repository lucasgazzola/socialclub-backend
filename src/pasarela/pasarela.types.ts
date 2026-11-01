import type { ConceptoCobro, EstadoOrdenPago, Prisma } from '@prisma/client';

/** Un renglón de lo que se cobra (se muestra en el checkout de la pasarela). */
export interface ItemCobro {
  titulo: string;
  cantidad: number;
  precioUnitario: number;
}

/** Lo que la facade le pide a la pasarela para generar un cobro. */
export interface SolicitudCobro {
  /** Referencia de la orden: vuelve con cada pago y notificación. */
  referencia: string;
  descripcion: string;
  items: ItemCobro[];
  pagador: { nombre: string; apellido: string };
  /** A dónde vuelve el usuario después de pagar (o de desistir). */
  urlRetorno: string;
  /** URL pública del webhook, o null si la API no es accesible desde internet. */
  urlNotificacion: string | null;
  expiraEn: Date;
}

/** Cobro generado en la pasarela: a dónde mandar al usuario. */
export interface CobroCreado {
  idCobroExterno: string;
  urlPago: string;
}

/** Estado de un pago según la pasarela, ya traducido al vocabulario propio. */
export type EstadoPagoPasarela = 'APROBADO' | 'PENDIENTE' | 'RECHAZADO';

/** Un pago tal como lo informa la pasarela. */
export interface PagoInformado {
  idPagoExterno: string;
  /** Referencia de la orden a la que pertenece. */
  referencia: string;
  estado: EstadoPagoPasarela;
  monto: number;
  /** Detalle legible del estado (p. ej. el motivo del rechazo). */
  detalle: string;
}

/** Una notificación (webhook) tal como llega al controller. */
export interface NotificacionEntrante {
  headers: Record<string, string | string[] | undefined>;
  query: Record<string, unknown>;
  body: unknown;
}

/** Lo que un módulo de dominio pide cobrar. */
export interface SolicitudOrden {
  concepto: ConceptoCobro;
  usuarioId: number;
  descripcion: string;
  items: ItemCobro[];
  /** Lo que el acreditador va a necesitar al aprobarse el pago. */
  datos: Prisma.InputJsonValue;
  /**
   * Reserva lo que se vende (p. ej. el cupo de entradas) en la misma
   * transacción en que se crea la orden. Si la orden no se paga, el
   * acreditador lo libera.
   */
  reservar?: (tx: Prisma.TransactionClient) => Promise<void>;
}

/** Lo que la API devuelve de una orden. */
export interface OrdenPagoResumen {
  referencia: string;
  concepto: ConceptoCobro;
  estado: EstadoOrdenPago;
  pasarela: string;
  descripcion: string;
  monto: number;
  /** A dónde mandar al usuario para pagar (null si no hace falta pagar). */
  urlPago: string | null;
  detalleEstado: string | null;
  expiraEn: Date;
  creadoEn: Date;
}
