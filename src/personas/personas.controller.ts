import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PersonasService } from './personas.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

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
}
