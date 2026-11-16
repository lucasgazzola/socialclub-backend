import { Injectable } from '@nestjs/common';
import { Tarea, type ContextoTarea, type TareaAutomatica } from '../tareas/tarea-automatica';
import { AlertasService } from './alertas.service';

/** US-26 · DT-22 — Avisa a los delegados las alertas de documentación nuevas. */
@Tarea()
@Injectable()
export class VencimientosDocumentacionTarea implements TareaAutomatica {
  readonly nombre = 'vencimientos-documentacion';
  readonly descripcion =
    'Avisa por email a los delegados la documentación que vence o debe presentarse en los próximos 10 días, y la ya vencida.';
  readonly horario = 'Todos los días a las 08:00';

  constructor(private readonly alertas: AlertasService) {}

  async ejecutar({ hoy }: ContextoTarea) {
    return { ...(await this.alertas.notificar(hoy)) };
  }
}
