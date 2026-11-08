import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { ApiErrores } from '../common/swagger/respuestas';
import { DashboardService } from './dashboard.service';
import { DashboardResponseDto } from './dto/dashboard-response.dto';

/**
 * US-34 · Ver dashboard
 * Endpoint consolidado de métricas e indicadores de gestión del club.
 * Acceso restringido exclusivamente a ADMIN y COLABORADOR.
 */
@ApiTags('dashboard')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  @Roles('ADMIN', 'COLABORADOR')
  @ApiOperation({
    summary: 'US-34 — Ver dashboard con métricas clave de la organización',
    description:
      'Retorna total de integrantes activos, porcentaje de morosos, cantidad de documentos por vencer, inscripciones irregulares y próximos eventos.',
  })
  @ApiOkResponse({
    type: DashboardResponseDto,
    description: 'Métricas consolidadas del dashboard',
  })
  @ApiErrores({
    401: 'Unauthorized',
    403: 'No tenés permisos suficientes para esta operación',
  })
  getMetricas(): Promise<DashboardResponseDto> {
    return this.dashboardService.getMetricas();
  }
}
