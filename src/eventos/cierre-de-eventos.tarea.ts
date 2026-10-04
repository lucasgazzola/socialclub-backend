import { Injectable } from '@nestjs/common';
import { Tarea, type ContextoTarea, type TareaAutomatica } from '../tareas/tarea-automatica';
import { EventosService } from './eventos.service';
import { DURACION_POR_DEFECTO_HORAS } from './fin-del-evento';

/** DT-33 — Finaliza los eventos terminados y expira sus entradas sin usar. */
@Tarea()
@Injectable()
export class CierreDeEventosTarea implements TareaAutomatica {
  readonly nombre = 'cierre-de-eventos';
  readonly descripcion = `Finaliza los eventos publicados que ya terminaron (fin del evento o ${DURACION_POR_DEFECTO_HORAS} h después del inicio) y marca como expiradas sus entradas sin usar.`;
  readonly horario = 'Todos los días a las 05:00';

  constructor(private readonly eventos: EventosService) {}

  async ejecutar({ hoy }: ContextoTarea) {
    return { ...(await this.eventos.cerrarTerminados(hoy)) };
  }
}
