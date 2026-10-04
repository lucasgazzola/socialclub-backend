import { Body, Controller, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiTags,
  ApiCreatedResponse,
  ApiOkResponse,
} from '@nestjs/swagger';
import { PagosService } from './pagos.service';
import { RegistrarPagoDto } from './dto/registrar-pago.dto';
import { RegistrarPagoSocioDto } from './dto/registrar-pago-socio.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { ApiErrores, VALIDACION } from '../common/swagger/respuestas';

@ApiTags('pagos')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('pagos')
export class PagosController {
  constructor(private readonly pagosService: PagosService) {}

  // ── Endpoints de Secretaría (US-17) ──────────────────────────────────────────

  @Get('socio/:id/cuotas-pendientes')
  @Roles('ADMIN', 'COLABORADOR')
  @ApiOperation({
    summary: 'US-17 — Obtener cuotas pendientes y estado de deuda de un socio (Secretaría)',
  })
  @ApiOkResponse({ description: 'Cuotas sociales pendientes y estado financiero del socio' })
  @ApiErrores({
    400: [VALIDACION, 'El socio no posee registros de membresía'],
    401: 'Unauthorized',
    403: 'No tenés permisos suficientes para esta operación',
    404: 'Socio no encontrado',
  })
  getCuotasPendientesSocio(@Param('id', ParseIntPipe) id: number) {
    return this.pagosService.getCuotasPendientesPorSocio(id);
  }

  @Post('socio/:id')
  @Roles('ADMIN', 'COLABORADOR')
  @ApiOperation({
    summary: 'US-17 — Registrar cobro de cuota social de un socio por secretaría',
  })
  @ApiCreatedResponse({ description: 'Pago registrado' })
  @ApiErrores({
    400: [
      VALIDACION,
      'Debe seleccionar al menos un período para abonar',
      'El monto total a abonar debe ser superior a cero',
      'El sistema no permite registrar pagos correspondientes a períodos futuros (…)',
      'El sistema no permite registrar pagos por montos iguales o inferiores a cero (la cuota para el período … es $…).',
      'El socio no posee registros de membresía',
    ],
    401: 'Unauthorized',
    403: 'No tenés permisos suficientes para esta operación',
    404: 'Socio no encontrado',
    409: 'No es posible procesar el pago: el/los período(s) […] ya figuran como pagados.',
  })
  registrarPagoSocio(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RegistrarPagoSocioDto,
  ) {
    return this.pagosService.registrarPagoPorSocio(id, dto, user.id);
  }

  @Get('socio/:id/historial')
  @Roles('ADMIN', 'COLABORADOR')
  @ApiOperation({
    summary: 'US-17 — Obtener historial de pagos de un socio (Secretaría)',
  })
  @ApiOkResponse({ description: 'Pagos y cuotas adeudadas del socio' })
  @ApiErrores({
    400: [VALIDACION, 'El socio no posee registros de membresía'],
    401: 'Unauthorized',
    403: 'No tenés permisos suficientes para esta operación',
    404: 'Socio no encontrado',
  })
  getHistorialSocio(@Param('id', ParseIntPipe) id: number) {
    return this.pagosService.getHistorialPagosPorSocio(id);
  }

  // ── Endpoints de Autoservicio del Socio (US-10) ──────────────────────────────

  @Get('mis-cuotas')
  @Roles('SOCIO', 'ADMIN', 'COLABORADOR')
  @ApiOperation({
    summary: 'US-10 — Obtener cuotas pendientes y estado financiero dinámico del socio autenticado',
  })
  @ApiOkResponse({ description: 'Cuotas sociales pendientes del usuario' })
  @ApiErrores({
    400: [
      'El socio no posee registros de membresía',
      'El usuario no posee registros de membresía de socio',
    ],
    401: 'Unauthorized',
    403: 'No tenés permisos suficientes para esta operación',
    404: ['No se encontró una ficha de persona asociada al usuario', 'Socio no encontrado'],
  })
  getMisCuotas(@CurrentUser() user: AuthenticatedUser) {
    return this.pagosService.getCuotasPendientes(user.id);
  }

  @Post('registrar')
  @Roles('SOCIO', 'ADMIN', 'COLABORADOR')
  @ApiOperation({
    summary:
      'US-10 — Registrar pago de uno o más períodos pendientes de cuota social (Mock pasarela)',
  })
  @ApiCreatedResponse({ description: 'Pago registrado' })
  @ApiErrores({
    400: [
      VALIDACION,
      'Debe seleccionar al menos un período para abonar',
      'El monto total a abonar debe ser superior a cero',
      'El sistema no permite registrar pagos correspondientes a períodos futuros (…)',
      'El sistema no permite registrar pagos por montos iguales o inferiores a cero (la cuota para el período … es $…).',
      'El socio no posee registros de membresía',
      'El usuario no posee registros de membresía de socio',
    ],
    401: 'Unauthorized',
    403: 'No tenés permisos suficientes para esta operación',
    404: ['No se encontró una ficha de persona asociada al usuario', 'Socio no encontrado'],
    409: 'No es posible procesar el pago: el/los período(s) […] ya figuran como pagados.',
  })
  registrarPago(@CurrentUser() user: AuthenticatedUser, @Body() dto: RegistrarPagoDto) {
    return this.pagosService.registrarPago(user.id, dto);
  }

  @Get('historial')
  @Roles('SOCIO', 'ADMIN', 'COLABORADOR')
  @ApiOperation({
    summary: 'US-10 — Obtener el historial de pagos realizados por el socio autenticado',
  })
  @ApiOkResponse({ description: 'Historial de pagos del usuario' })
  @ApiErrores({
    400: [
      'El socio no posee registros de membresía',
      'El usuario no posee registros de membresía de socio',
    ],
    401: 'Unauthorized',
    403: 'No tenés permisos suficientes para esta operación',
    404: ['No se encontró una ficha de persona asociada al usuario', 'Socio no encontrado'],
  })
  getHistorial(@CurrentUser() user: AuthenticatedUser) {
    return this.pagosService.getHistorialPagos(user.id);
  }
}
