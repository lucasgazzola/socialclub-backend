import { Body, Controller, Get, Param, ParseIntPipe, Patch, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PersonasService } from './personas.service';
import { ActualizarPersonaDto } from './dto/actualizar-persona.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';

@ApiTags('personas')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('personas')
export class PersonasController {
  constructor(private readonly personasService: PersonasService) {}

  @Get('dni/:dni')
  @Roles('ADMIN', 'DELEGADO')
  @ApiOperation({ summary: 'US — Buscar participante por DNI (flujo de inscripción)' })
  findByDni(@Param('dni') dni: string) {
    return this.personasService.findByDni(dni);
  }

  @Patch(':id')
  @Roles('ADMIN', 'DELEGADO')
  @ApiOperation({
    summary:
      'US-06 — Editar datos básicos de un participante (camino directo cuando no tiene inscripciones vigentes, US-07)',
  })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ActualizarPersonaDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.personasService.update(id, dto, user.id);
  }
}
