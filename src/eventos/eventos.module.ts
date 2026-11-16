import { Module } from '@nestjs/common';
import { EventosController } from './eventos.controller';
import { EventosService } from './eventos.service';
import { CierreDeEventosTarea } from './cierre-de-eventos.tarea';

@Module({
  controllers: [EventosController],
  providers: [EventosService, CierreDeEventosTarea],
  exports: [EventosService],
})
export class EventosModule {}
