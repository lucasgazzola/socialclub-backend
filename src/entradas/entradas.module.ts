import { Module } from '@nestjs/common';
import { EntradasController } from './entradas.controller';
import { EntradasService } from './entradas.service';
import { EntradasAcreditador } from './entradas.acreditador';
import { PasarelaModule } from '../pasarela/pasarela.module';

@Module({
  imports: [PasarelaModule],
  controllers: [EntradasController],
  providers: [EntradasService, EntradasAcreditador],
  exports: [EntradasService],
})
export class EntradasModule {}
