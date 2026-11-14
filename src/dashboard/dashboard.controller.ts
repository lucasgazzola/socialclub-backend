import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
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
      'Retorna total de integrantes activos, porcentaje de morosos, cantidad de documentos por vencer, inscripciones irregulares y próximos eventos. Cuenta con caché en memoria de 5 minutos.',
  })
  @ApiQuery({
    name: 'forzar',
    required: false,
    type: Boolean,
    description:
      'Si es true, invalida la caché en memoria y reejecuta el cálculo contra la base de datos.',
  })
  @ApiOkResponse({
    type: DashboardResponseDto,
    description: 'Métricas consolidadas del dashboard',
  })
  @ApiErrores({
    401: 'Unauthorized',
    403: 'No tenés permisos suficientes para esta operación',
  })
  getMetricas(@Query('forzar') forzar?: string): Promise<DashboardResponseDto> {
    const forzarRecalculo = forzar === 'true' || forzar === '1';
    return this.dashboardService.getMetricas(undefined, forzarRecalculo);
  }
}
