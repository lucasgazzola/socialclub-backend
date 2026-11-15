import { Module } from '@nestjs/common';
import { CuotaSocialModule } from '../cuota-social/cuota-social.module';
import { ClubController } from './club.controller';
import { ClubService } from './club.service';

/** TASK-60 — Información institucional pública para la landing. */
@Module({
  imports: [CuotaSocialModule],
  controllers: [ClubController],
  providers: [ClubService],
})
export class ClubModule {}
