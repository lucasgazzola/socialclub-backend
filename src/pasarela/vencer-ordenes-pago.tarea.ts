import { Injectable } from '@nestjs/common';
import { Tarea, type ContextoTarea, type TareaAutomatica } from '../tareas/tarea-automatica';
import { PasarelaService } from './pasarela.service';

/** TASK-51 — Vence las órdenes de pago que nadie pagó y libera lo reservado. */
@Tarea()
@Injectable()
export class VencerOrdenesPagoTarea implements TareaAutomatica {
  readonly nombre = 'vencer-ordenes-pago';
  readonly descripcion =
    'Vence las órdenes de pago online pendientes que pasaron su plazo y libera el cupo reservado. Antes consulta la pasarela: si el pago entró y el aviso se perdió, la acredita.';
  readonly horario = 'Cada hora';

  constructor(private readonly pasarela: PasarelaService) {}

  async ejecutar({ hoy }: ContextoTarea) {
    return { ...(await this.pasarela.vencerOrdenes(hoy)) };
  }
}
