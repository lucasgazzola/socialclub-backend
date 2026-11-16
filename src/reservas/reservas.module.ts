import { Module } from '@nestjs/common';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';
import { PagosModule } from '../pagos/pagos.module';
import { PasarelaModule } from '../pasarela/pasarela.module';
import { ReservasController } from './reservas.controller';
import { ReservasService } from './reservas.service';
import { ReservasPlantilla } from './reservas.plantilla';
import { ReservaAcreditador } from './reserva.acreditador';
import { VencerSenasReservasTarea } from './vencer-senas-reservas.tarea';

/** US-60 · US-61 · US-62 — Evaluación, cancelación y consulta de reservas (decisión 0004). */
@Module({
  imports: [NotificacionesModule, PagosModule, PasarelaModule],
  controllers: [ReservasController],
  providers: [ReservasService, ReservasPlantilla, ReservaAcreditador, VencerSenasReservasTarea],
  exports: [ReservasService],
})
export class ReservasModule {}
