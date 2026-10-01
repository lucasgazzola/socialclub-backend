import { Module } from '@nestjs/common';
import { CuotaSocialController } from './cuota-social.controller';
import { CuotaSocialService } from './cuota-social.service';

@Module({
  controllers: [CuotaSocialController],
  providers: [CuotaSocialService],
  exports: [CuotaSocialService],
})
export class CuotaSocialModule {}
