import { Injectable } from '@nestjs/common';
import { escapar, PlantillaEmail } from '../notificaciones/plantillas/plantilla-email';
import type { TipoNotificacion } from '../notificaciones/notificaciones.types';

/** Qué le pasó a la reserva. */
export type NovedadReserva =
  'APROBADA' | 'RECHAZADA' | 'CANCELADA_INSTITUCION' | 'CANCELADA_FALTA_PAGO';

export interface DatosAvisoReserva {
  novedad: NovedadReserva;
  codigo: string;
  espacio: string;
  /** Fecha y horario del turno, ya formateados en hora del club. */
  turno: string;
  /** Motivo del rechazo o de la cancelación. */
  motivo?: string | null;
  /** Seña y fecha límite para pagarla (al aprobar). */
  sena?: string;
  limitePago?: string;
}

const ASUNTO: Record<NovedadReserva, string> = {
  APROBADA: 'tu solicitud de reserva fue aprobada',
  RECHAZADA: 'tu solicitud de reserva fue rechazada',
  CANCELADA_INSTITUCION: 'el club canceló tu reserva',
  CANCELADA_FALTA_PAGO: 'tu reserva se canceló por falta de pago de la seña',
};

const INTRO: Record<NovedadReserva, string> = {
  APROBADA:
    'Aprobamos tu solicitud de reserva. Para confirmarla, aboná la seña antes de la fecha límite.',
  RECHAZADA: 'Revisamos tu solicitud de reserva y no pudimos aprobarla.',
  CANCELADA_INSTITUCION: 'El club tuvo que cancelar tu reserva.',
  CANCELADA_FALTA_PAGO:
    'Tu reserva se canceló porque venció el plazo para pagar la seña. El turno quedó libre.',
};

/** US-60 / US-61 — Aviso al solicitante cuando cambia el estado de su reserva. */
@Injectable()
export class ReservasPlantilla extends PlantillaEmail<DatosAvisoReserva> {
  readonly tipo: TipoNotificacion = 'RESERVA';

  protected asunto(d: DatosAvisoReserva): string {
    return `SocialClub · Reserva ${d.codigo}: ${ASUNTO[d.novedad]}`;
  }

  protected titulo(d: DatosAvisoReserva): string {
    return `Reserva ${d.codigo}`;
  }

  protected introduccion(d: DatosAvisoReserva): string {
    return INTRO[d.novedad];
  }

  private renglones(d: DatosAvisoReserva): [string, string][] {
    return [
      ['Espacio', d.espacio],
      ['Turno', d.turno],
      ...(d.sena ? ([['Seña', d.sena]] as [string, string][]) : []),
      ...(d.limitePago ? ([['Pagar antes del', d.limitePago]] as [string, string][]) : []),
      ...(d.motivo ? ([['Motivo', d.motivo]] as [string, string][]) : []),
    ];
  }

  protected cuerpoTexto(d: DatosAvisoReserva): string {
    return this.renglones(d)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n');
  }

  protected cuerpoHtml(d: DatosAvisoReserva): string {
    const filas = this.renglones(d)
      .map(
        ([k, v]) =>
          `<tr><td style="padding:6px 10px;color:#475569">${escapar(k)}</td><td style="padding:6px 10px;font-weight:bold">${escapar(v)}</td></tr>`,
      )
      .join('');
    return `<table style="border-collapse:collapse;font-size:14px">${filas}</table>`;
  }
}
