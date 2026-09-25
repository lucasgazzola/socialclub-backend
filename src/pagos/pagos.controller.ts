import { Body, Controller, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PagosService } from './pagos.service';
import { RegistrarPagoDto } from './dto/registrar-pago.dto';
import { RegistrarPagoSocioDto } from './dto/registrar-pago-socio.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';

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
  getCuotasPendientesSocio(@Param('id', ParseIntPipe) id: number) {
    return this.pagosService.getCuotasPendientesPorSocio(id);
  }

  @Post('socio/:id')
  @Roles('ADMIN', 'COLABORADOR')
  @ApiOperation({
    summary: 'US-17 — Registrar cobro de cuota social de un socio por secretaría',
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
  getHistorialSocio(@Param('id', ParseIntPipe) id: number) {
    return this.pagosService.getHistorialPagosPorSocio(id);
  }

  // ── Endpoints de Autoservicio del Socio (US-10) ──────────────────────────────

  @Get('mis-cuotas')
  @Roles('SOCIO', 'ADMIN', 'COLABORADOR')
  @ApiOperation({
    summary: 'US-10 — Obtener cuotas pendientes y estado financiero dinámico del socio autenticado',
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
  registrarPago(@CurrentUser() user: AuthenticatedUser, @Body() dto: RegistrarPagoDto) {
    return this.pagosService.registrarPago(user.id, dto);
  }

  @Get('historial')
  @Roles('SOCIO', 'ADMIN', 'COLABORADOR')
  @ApiOperation({
    summary: 'US-10 — Obtener el historial de pagos realizados por el socio autenticado',
  })
  getHistorial(@CurrentUser() user: AuthenticatedUser) {
    return this.pagosService.getHistorialPagos(user.id);
  }
}
