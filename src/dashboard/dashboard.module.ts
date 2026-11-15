import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PagosModule } from '../pagos/pagos.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [PrismaModule, PagosModule],
  controllers: [DashboardController],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}
