import { Injectable } from '@nestjs/common';
import { Tarea, type ContextoTarea, type TareaAutomatica } from '../tareas/tarea-automatica';
import { ReservasService } from './reservas.service';

/** US-61 CA 1 — Cancela por falta de pago las reservas con la seña vencida. */
@Tarea()
@Injectable()
export class VencerSenasReservasTarea implements TareaAutomatica {
  readonly nombre = 'vencer-senas-reservas';
  readonly descripcion =
    'Cancela por falta de pago las reservas aprobadas cuya seña no se pagó en el plazo, libera el turno y avisa al solicitante.';
  readonly horario = 'Cada hora';

  constructor(private readonly reservas: ReservasService) {}

  async ejecutar({ hoy }: ContextoTarea) {
    return { ...(await this.reservas.vencerSenas(hoy)) };
  }
}
