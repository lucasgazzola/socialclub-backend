import { Module } from '@nestjs/common';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';
import { VerificacionEmailController } from './verificacion-email.controller';
import { VerificacionEmailPlantilla } from './verificacion-email.plantilla';
import { VerificacionEmailService } from './verificacion-email.service';

/**
 * DT-54 — Verificación de email con enlace de un solo uso (decisión 0005).
 * Lo usan las altas de usuario, socio y participante y el registro público.
 */
@Module({
  imports: [NotificacionesModule],
  controllers: [VerificacionEmailController],
  providers: [VerificacionEmailService, VerificacionEmailPlantilla],
  exports: [VerificacionEmailService],
})
export class VerificacionEmailModule {}
