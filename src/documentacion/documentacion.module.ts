import { Module } from '@nestjs/common';
import { DocumentacionController } from './documentacion.controller';
import { DocumentacionService } from './documentacion.service';
import { EstadoDocumentalService } from './estado-documental.service';

@Module({
  controllers: [DocumentacionController],
  providers: [DocumentacionService, EstadoDocumentalService],
  exports: [DocumentacionService, EstadoDocumentalService],
})
export class DocumentacionModule {}
