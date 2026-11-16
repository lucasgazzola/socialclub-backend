import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ClubService } from './club.service';

@ApiTags('club')
@Controller('club')
export class ClubController {
  constructor(private readonly club: ClubService) {}

  // Público a propósito: lo consume la landing antes de iniciar sesión.
  @Get('publico')
  @ApiOperation({
    summary: 'TASK-60 — Información pública del club (planes, disciplinas y números)',
  })
  @ApiOkResponse({
    description: 'Planes de socio con cuota vigente, disciplinas activas y números',
  })
  informacionPublica() {
    return this.club.informacionPublica();
  }
}
