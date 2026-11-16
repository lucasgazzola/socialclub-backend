import { Module } from '@nestjs/common';
import { AlertasController } from './alertas.controller';
import { AlertasService } from './alertas.service';
import { AlertasDocumentacionPlantilla } from './alertas-documentacion.plantilla';
import { VencimientosDocumentacionTarea } from './vencimientos-documentacion.tarea';
import { DocumentacionModule } from '../documentacion/documentacion.module';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';

@Module({
  imports: [DocumentacionModule, NotificacionesModule],
  controllers: [AlertasController],
  providers: [AlertasService, AlertasDocumentacionPlantilla, VencimientosDocumentacionTarea],
})
export class AlertasModule {}
