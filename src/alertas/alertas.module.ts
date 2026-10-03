import { Module } from '@nestjs/common';
import { AlertasController } from './alertas.controller';
import { AlertasService } from './alertas.service';
import { CronTokenGuard } from './cron-token.guard';
import { DocumentacionModule } from '../documentacion/documentacion.module';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';

@Module({
  imports: [DocumentacionModule, NotificacionesModule],
  controllers: [AlertasController],
  providers: [AlertasService, CronTokenGuard],
})
export class AlertasModule {}
