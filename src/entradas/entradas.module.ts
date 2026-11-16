import { Module } from '@nestjs/common';
import { EntradasController } from './entradas.controller';
import { EntradasService } from './entradas.service';
import { EntradasAcreditador } from './entradas.acreditador';
import { CompraEntradasPlantilla } from './compra-entradas.plantilla';
import { PasarelaModule } from '../pasarela/pasarela.module';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';

@Module({
  imports: [PasarelaModule, NotificacionesModule],
  controllers: [EntradasController],
  providers: [EntradasService, EntradasAcreditador, CompraEntradasPlantilla],
  exports: [EntradasService],
})
export class EntradasModule {}
