import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { ApiErrores, VALIDACION } from '../common/swagger/respuestas';
import { ReportesService } from './reportes.service';
import { EstadoFinancieroQueryDto } from './dto/estado-financiero-query.dto';
import { AsistenciaEventosQueryDto } from './dto/asistencia-eventos-query.dto';

/**
 * Reportes — US-35 (Estado financiero) y US-36 (Reporte de asistencia y ocupación de eventos).
 * Roles autorizados: ADMIN y COLABORADOR.
 */
@ApiTags('reportes')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('reportes')
export class ReportesController {
  constructor(private readonly reportesService: ReportesService) {}

  @Get('estado-financiero')
  @Roles('ADMIN', 'COLABORADOR')
  @ApiOperation({
    summary:
      'US-35 — Estado financiero: recaudado, adeudado, morosos y porcentaje de cobranza de las cuotas de un rango de meses',
  })
  @ApiOkResponse({
    description: 'Totales, apertura por concepto, por disciplina y por mes',
  })
  @ApiErrores({
    400: [
      VALIDACION,
      'El período «desde» no puede ser posterior a «hasta».',
      'El reporte abarca como máximo 36 meses.',
    ],
    401: 'Unauthorized',
    403: 'No tenés permisos suficientes para esta operación',
  })
  estadoFinanciero(@Query() query: EstadoFinancieroQueryDto) {
    return this.reportesService.estadoFinanciero(query);
  }

  @Get('asistencia-eventos')
  @Roles('ADMIN', 'COLABORADOR')
  @ApiOperation({
    summary:
      'US-36 — Reporte de asistencia a eventos: total de entradas, ingresos validados y porcentaje de ocupación',
  })
  @ApiOkResponse({
    description: 'Reporte consolidado de asistencia y ocupación por evento y totales globales',
  })
  @ApiErrores({
    400: [VALIDACION, 'La fecha «desde» no puede ser posterior a «hasta».'],
    401: 'Unauthorized',
    403: 'No tenés permisos suficientes para esta operación',
  })
  asistenciaEventos(@Query() query: AsistenciaEventosQueryDto) {
    return this.reportesService.asistenciaEventos(query);
  }
}
