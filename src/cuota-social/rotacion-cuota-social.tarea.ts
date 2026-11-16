import { Injectable } from '@nestjs/common';
import { Tarea, type ContextoTarea, type TareaAutomatica } from '../tareas/tarea-automatica';
import { CuotaSocialService } from './cuota-social.service';

/** DT-22 — Activa la cuota social que empieza a regir en el mes. */
@Tarea()
@Injectable()
export class RotacionCuotaSocialTarea implements TareaAutomatica {
  readonly nombre = 'rotacion-cuota-social';
  readonly descripcion =
    'Marca como activa la configuración de cuota social que empieza a regir en el mes y desactiva la anterior de cada categoría.';
  readonly horario = 'El día 1 de cada mes a las 03:00';

  constructor(private readonly cuotaSocial: CuotaSocialService) {}

  async ejecutar({ hoy }: ContextoTarea) {
    return { ...(await this.cuotaSocial.sincronizarVigentes(hoy)) };
  }
}
