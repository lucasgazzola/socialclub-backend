import { Module } from '@nestjs/common';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';
import { DocumentacionController } from './documentacion.controller';
import { DocumentacionService } from './documentacion.service';
import { EstadoDocumentalService } from './estado-documental.service';
import { RevisionDocumentacionPlantilla } from './revision-documentacion.plantilla';

@Module({
  imports: [NotificacionesModule],
  controllers: [DocumentacionController],
  providers: [DocumentacionService, EstadoDocumentalService, RevisionDocumentacionPlantilla],
  exports: [DocumentacionService, EstadoDocumentalService],
})
export class DocumentacionModule {}
