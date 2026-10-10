import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiTags,
  ApiCreatedResponse,
  ApiOkResponse,
} from '@nestjs/swagger';
import { PagosDeportivosService } from './pagos-deportivos.service';
import { RegistrarPagoDeportivoDto } from './dto/registrar-pago-deportivo.dto';
import { HistorialDeportivoQueryDto } from './dto/historial-deportivo-query.dto';
import { FindMorososDeportivosQueryDto } from './dto/find-morosos-deportivos-query.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { ApiErrores, VALIDACION } from '../common/swagger/respuestas';

/**
 * US-21 — Registro de pagos de cuota deportiva por secretaría.
 * El rol "secretario" se mapea a ADMIN / COLABORADOR (igual que el cobro de
 * cuota social de secretaría, US-17).
 */
@ApiTags('pagos-deportivos')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('pagos-deportivos')
export class PagosDeportivosController {
  constructor(private readonly pagosDeportivosService: PagosDeportivosService) {}

  @Get('morosos')
  @Roles('ADMIN', 'COLABORADOR')
  @ApiOperation({
    summary:
      'US-23 — Morosos de cuota deportiva: cuotas vencidas (después del día 10 de su mes) e impagas, por disciplina',
  })
  @ApiOkResponse({
    description: 'Morosos con su deuda vencida separada por disciplina, y la deuda total',
  })
  @ApiErrores({
    400: VALIDACION,
    401: 'Unauthorized',
    403: 'No tenés permisos suficientes para esta operación',
  })
  getMorosos(@Query() query: FindMorososDeportivosQueryDto) {
    return this.pagosDeportivosService.getMorosos(query);
  }

  @Get('persona/:id/pendientes')
  @Roles('ADMIN', 'COLABORADOR')
  @ApiOperation({
    summary: 'US-21 — Cuotas deportivas pendientes y estado de deuda de un participante',
  })
  @ApiOkResponse({ description: 'Cuotas deportivas pendientes y estado de deuda del participante' })
  @ApiErrores({
    400: VALIDACION,
    401: 'Unauthorized',
    403: 'No tenés permisos suficientes para esta operación',
    404: 'Participante no encontrado',
  })
  getPendientes(@Param('id', ParseIntPipe) id: number) {
    return this.pagosDeportivosService.getPendientesPorPersona(id);
  }

  @Post('persona/:id')
  @Roles('ADMIN', 'COLABORADOR')
  @ApiOperation({
    summary: 'US-21 — Registrar el pago de una o varias cuotas deportivas de un participante',
  })
  @ApiCreatedResponse({ description: 'Pago registrado y estado de deuda recalculado' })
  @ApiErrores({
    400: [
      VALIDACION,
      'Debe seleccionar al menos un período para abonar',
      'El participante no está inscripto en la disciplina indicada',
      'No hay una tarifa configurada para … en el período …',
      'No se permite registrar pagos anteriores a la inscripción (…): …',
      'No se permite registrar pagos de períodos futuros (…)',
      'No se permite registrar pagos posteriores a la baja de la disciplina: …',
      'No se pueden repetir períodos en la misma operación',
    ],
    401: 'Unauthorized',
    403: 'No tenés permisos suficientes para esta operación',
    404: 'Participante no encontrado',
    409: 'No es posible procesar el pago: el/los período(s) […] ya figuran como pagados.',
  })
  registrarPago(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RegistrarPagoDeportivoDto,
  ) {
    return this.pagosDeportivosService.registrarPago(id, dto, user.id);
  }

  @Get('persona/:id/historial')
  @Roles('ADMIN', 'COLABORADOR')
  @ApiOperation({
    summary:
      'US-22 — Historial de cuotas deportivas de un participante (pagos y adeudados, filtrable por fecha)',
  })
  @ApiOkResponse({ description: 'Pagos y períodos adeudados del participante' })
  @ApiErrores({
    400: VALIDACION,
    401: 'Unauthorized',
    403: 'No tenés permisos suficientes para esta operación',
    404: 'Participante no encontrado',
  })
  getHistorial(@Param('id', ParseIntPipe) id: number, @Query() query: HistorialDeportivoQueryDto) {
    return this.pagosDeportivosService.getHistorialPorPersona(id, query);
  }
}
