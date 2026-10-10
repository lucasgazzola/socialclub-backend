import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { ApiErrores, VALIDACION } from '../common/swagger/respuestas';
import { ReportesService } from './reportes.service';
import { EstadoFinancieroQueryDto } from './dto/estado-financiero-query.dto';

/**
 * US-35 — Reportes. El "tesorero" se mapea a ADMIN y COLABORADOR, los mismos
 * roles que gestionan la cobranza (US-19, US-21, US-23).
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
}
