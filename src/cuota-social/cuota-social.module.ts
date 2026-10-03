import { Module } from '@nestjs/common';
import { CuotaSocialController } from './cuota-social.controller';
import { CuotaSocialService } from './cuota-social.service';
import { RotacionCuotaSocialTarea } from './rotacion-cuota-social.tarea';

@Module({
  controllers: [CuotaSocialController],
  providers: [CuotaSocialService, RotacionCuotaSocialTarea],
  exports: [CuotaSocialService],
})
export class CuotaSocialModule {}
