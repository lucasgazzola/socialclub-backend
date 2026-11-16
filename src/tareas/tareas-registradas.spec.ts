import { VencimientosDocumentacionTarea } from '../alertas/vencimientos-documentacion.tarea';
import { ReintentarNotificacionesTarea } from '../notificaciones/reintentar-notificaciones.tarea';
import { RotacionCuotaSocialTarea } from '../cuota-social/rotacion-cuota-social.tarea';
import { CierreDeEventosTarea } from '../eventos/cierre-de-eventos.tarea';
import type { EventosService } from '../eventos/eventos.service';
import type { AlertasService } from '../alertas/alertas.service';
import type { NotificacionesService } from '../notificaciones/notificaciones.service';
import type { CuotaSocialService } from '../cuota-social/cuota-social.service';

/**
 * DT-22 · Tareas registradas: cada una delega en el servicio de su dominio y
 * devuelve su resumen. Los nombres son parte del contrato con el workflow.
 */
describe('DT-22 · Tareas automáticas registradas', () => {
  const hoy = new Date(2026, 9, 3);

  it('vencimientos-documentacion avisa las alertas nuevas (US-26)', async () => {
    const alertas = { notificar: jest.fn().mockResolvedValue({ alertas: 3, nuevas: 1 }) };
    const tarea = new VencimientosDocumentacionTarea(alertas as unknown as AlertasService);

    expect(tarea.nombre).toBe('vencimientos-documentacion');
    await expect(tarea.ejecutar({ hoy })).resolves.toEqual({ alertas: 3, nuevas: 1 });
    expect(alertas.notificar).toHaveBeenCalledWith(hoy);
  });

  it('reintentar-notificaciones despacha lo pendiente del outbox (DT-36)', async () => {
    const notificaciones = {
      despacharPendientes: jest.fn().mockResolvedValue({ revisadas: 2, enviadas: 2 }),
    };
    const tarea = new ReintentarNotificacionesTarea(
      notificaciones as unknown as NotificacionesService,
    );

    expect(tarea.nombre).toBe('reintentar-notificaciones');
    await expect(tarea.ejecutar({ hoy })).resolves.toEqual({ revisadas: 2, enviadas: 2 });
    expect(notificaciones.despacharPendientes).toHaveBeenCalledWith(hoy);
  });

  it('rotacion-cuota-social sincroniza la cuota vigente del mes', async () => {
    const resumen = { periodo: '2026-10', categorias: 3, activadas: 1, desactivadas: 1 };
    const cuotaSocial = { sincronizarVigentes: jest.fn().mockResolvedValue(resumen) };
    const tarea = new RotacionCuotaSocialTarea(cuotaSocial as unknown as CuotaSocialService);

    expect(tarea.nombre).toBe('rotacion-cuota-social');
    await expect(tarea.ejecutar({ hoy })).resolves.toEqual(resumen);
    expect(cuotaSocial.sincronizarVigentes).toHaveBeenCalledWith(hoy);
  });

  it('cierre-de-eventos finaliza los eventos terminados y expira sus entradas (DT-33)', async () => {
    const resumen = { eventosFinalizados: 2, entradasExpiradas: 7 };
    const eventos = { cerrarTerminados: jest.fn().mockResolvedValue(resumen) };
    const tarea = new CierreDeEventosTarea(eventos as unknown as EventosService);

    expect(tarea.nombre).toBe('cierre-de-eventos');
    await expect(tarea.ejecutar({ hoy })).resolves.toEqual(resumen);
    expect(eventos.cerrarTerminados).toHaveBeenCalledWith(hoy);
  });
});
