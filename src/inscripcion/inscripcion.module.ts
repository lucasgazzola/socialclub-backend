import { Module } from '@nestjs/common';
import { InscripcionService } from './inscripcion.service';
import { InscripcionController } from './inscripcion.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { DocumentacionModule } from '../documentacion/documentacion.module';
import { VerificacionEmailModule } from '../verificacion-email/verificacion-email.module';

@Module({
  imports: [PrismaModule, DocumentacionModule, VerificacionEmailModule],
  controllers: [InscripcionController],
  providers: [InscripcionService],
  exports: [InscripcionService],
})
export class InscripcionModule {}
