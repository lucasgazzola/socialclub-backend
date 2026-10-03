import { Module } from '@nestjs/common';
import { NotificacionesService } from './notificaciones.service';
import { CANALES, type Canal } from './canales/canal';
import { CanalEmail } from './canales/canal-email';
import { PROVEEDOR_EMAIL } from './proveedores/proveedor-email';
import { ProveedorSmtp } from './proveedores/proveedor-smtp';
import { ReintentarNotificacionesTarea } from './reintentar-notificaciones.tarea';

/**
 * Servicio centralizado de notificaciones (DT-36). Solo exporta la facade.
 * Para sumar un canal: implementar `Canal`, agregarlo a `providers` y al
 * `inject` del registro `CANALES`.
 */
@Module({
  providers: [
    ProveedorSmtp,
    { provide: PROVEEDOR_EMAIL, useExisting: ProveedorSmtp },
    CanalEmail,
    {
      provide: CANALES,
      useFactory: (...canales: Canal[]) => canales,
      inject: [CanalEmail],
    },
    NotificacionesService,
    ReintentarNotificacionesTarea,
  ],
  exports: [NotificacionesService],
})
export class NotificacionesModule {}
