import { Module } from '@nestjs/common';
import { PagosModule } from '../pagos/pagos.module';
import { ReportesController } from './reportes.controller';
import { ReportesService } from './reportes.service';

/** US-35 (y futuros reportes, US-36): lecturas agregadas sobre otros módulos. */
@Module({
  imports: [PagosModule],
  controllers: [ReportesController],
  providers: [ReportesService],
})
export class ReportesModule {}
