import { Module } from '@nestjs/common';
import { PagosController } from './pagos.controller';
import { PagosService } from './pagos.service';
import { PagosDeportivosController } from './pagos-deportivos.controller';
import { PagosDeportivosService } from './pagos-deportivos.service';

@Module({
  controllers: [PagosController, PagosDeportivosController],
  providers: [PagosService, PagosDeportivosService],
  exports: [PagosService, PagosDeportivosService],
})
export class PagosModule {}
