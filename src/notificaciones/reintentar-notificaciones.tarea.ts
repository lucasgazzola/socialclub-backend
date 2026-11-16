import { Injectable } from '@nestjs/common';
import { Tarea, type ContextoTarea, type TareaAutomatica } from '../tareas/tarea-automatica';
import { HORAS_REINTENTO, MAX_INTENTOS, NotificacionesService } from './notificaciones.service';

/** DT-36 · DT-22 — Reenvía lo que quedó pendiente o fallido en el outbox. */
@Tarea()
@Injectable()
export class ReintentarNotificacionesTarea implements TareaAutomatica {
  readonly nombre = 'reintentar-notificaciones';
  readonly descripcion = `Reenvía las notificaciones pendientes o fallidas de las últimas ${HORAS_REINTENTO} horas (hasta ${MAX_INTENTOS} intentos).`;
  readonly horario = 'Cada 6 horas';

  constructor(private readonly notificaciones: NotificacionesService) {}

  async ejecutar({ hoy }: ContextoTarea) {
    return { ...(await this.notificaciones.despacharPendientes(hoy)) };
  }
}
