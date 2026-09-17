import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PagosService } from './pagos.service';
import { RegistrarPagoDto } from './dto/registrar-pago.dto';
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

  @Get('mis-cuotas')
  @Roles('SOCIO', 'ADMIN', 'COLABORADOR')
  @ApiOperation({
    summary: 'Obtener cuotas pendientes y estado financiero dinámico del socio autenticado',
  })
  getMisCuotas(@CurrentUser() user: AuthenticatedUser) {
    return this.pagosService.getCuotasPendientes(user.id);
  }

  @Post('registrar')
  @Roles('SOCIO', 'ADMIN', 'COLABORADOR')
  @ApiOperation({
    summary: 'Registrar pago de uno o más períodos pendientes de cuota social (Mock pasarela)',
  })
  registrarPago(@CurrentUser() user: AuthenticatedUser, @Body() dto: RegistrarPagoDto) {
    return this.pagosService.registrarPago(user.id, dto);
  }

  @Get('historial')
  @Roles('SOCIO', 'ADMIN', 'COLABORADOR')
  @ApiOperation({
    summary: 'Obtener el historial de pagos realizados por el socio autenticado',
  })
  getHistorial(@CurrentUser() user: AuthenticatedUser) {
    return this.pagosService.getHistorialPagos(user.id);
  }
}
