import { Module } from '@nestjs/common';
import { SociosController } from './socios.controller';
import { SociosService } from './socios.service';
import { VerificacionEmailModule } from '../verificacion-email/verificacion-email.module';

@Module({
  imports: [VerificacionEmailModule],
  controllers: [SociosController],
  providers: [SociosService],
  exports: [SociosService],
})
export class SociosModule {}
