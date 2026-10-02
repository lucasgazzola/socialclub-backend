import { Module } from '@nestjs/common';
import { InscripcionService } from './inscripcion.service';
import { InscripcionController } from './inscripcion.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { DocumentacionModule } from '../documentacion/documentacion.module';

@Module({
  imports: [PrismaModule, DocumentacionModule],
  controllers: [InscripcionController],
  providers: [InscripcionService],
  exports: [InscripcionService],
})
export class InscripcionModule {}
