import { Body, Controller, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PagosDeportivosService } from './pagos-deportivos.service';
import { RegistrarPagoDeportivoDto } from './dto/registrar-pago-deportivo.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';

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

  @Get('persona/:id/pendientes')
  @Roles('ADMIN', 'COLABORADOR')
  @ApiOperation({
    summary: 'US-21 — Cuotas deportivas pendientes y estado de deuda de un participante',
  })
  getPendientes(@Param('id', ParseIntPipe) id: number) {
    return this.pagosDeportivosService.getPendientesPorPersona(id);
  }

  @Post('persona/:id')
  @Roles('ADMIN', 'COLABORADOR')
  @ApiOperation({
    summary: 'US-21 — Registrar el pago de una o varias cuotas deportivas de un participante',
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
  @ApiOperation({ summary: 'US-21 — Historial de pagos de cuota deportiva de un participante' })
  getHistorial(@Param('id', ParseIntPipe) id: number) {
    return this.pagosDeportivosService.getHistorialPorPersona(id);
  }
}
