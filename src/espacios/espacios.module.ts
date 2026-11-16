import { Module } from '@nestjs/common';
import { EspaciosController } from './espacios.controller';
import { EspaciosService } from './espacios.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditoriaModule } from '../auditoria/auditoria.module';

@Module({
  imports: [PrismaModule, AuditoriaModule],
  controllers: [EspaciosController],
  providers: [EspaciosService],
  exports: [EspaciosService],
})
export class EspaciosModule {}
