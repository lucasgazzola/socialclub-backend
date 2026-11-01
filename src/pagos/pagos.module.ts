import { Module } from '@nestjs/common';
import { PagosController } from './pagos.controller';
import { PagosService } from './pagos.service';
import { PagosDeportivosController } from './pagos-deportivos.controller';
import { PagosDeportivosService } from './pagos-deportivos.service';
import { CuotaSocialAcreditador } from './cuota-social.acreditador';
import { PasarelaModule } from '../pasarela/pasarela.module';

@Module({
  imports: [PasarelaModule],
  controllers: [PagosController, PagosDeportivosController],
  providers: [PagosService, PagosDeportivosService, CuotaSocialAcreditador],
  exports: [PagosService, PagosDeportivosService],
})
export class PagosModule {}
