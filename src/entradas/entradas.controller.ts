import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { EntradasService } from './entradas.service';
import { CrearEntradasDto } from './dto/crear-entradas.dto';
import { ValidarAccesoDto } from './dto/validar-acceso.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';

@ApiTags('entradas')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('entradas')
export class EntradasController {
  constructor(private readonly entradasService: EntradasService) {}

  @Post()
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Generar N entradas únicas con token UUID para un evento',
  })
  crearMultiples(@Body() dto: CrearEntradasDto, @CurrentUser() user: AuthenticatedUser) {
    return this.entradasService.crearMultiples(dto, user.id);
  }

  @Get('evento/:eventoId')
  @Roles('ADMIN', 'COLABORADOR')
  @ApiOperation({ summary: 'Listar entradas de un evento' })
  listarPorEvento(@Param('eventoId', ParseIntPipe) eventoId: number) {
    return this.entradasService.listarPorEvento(eventoId);
  }

  @Post('validar')
  @HttpCode(200)
  @Roles('ADMIN', 'COLABORADOR')
  @ApiOperation({ summary: 'US-31 — Validar acceso mediante lectura de QR' })
  validarAcceso(@Body() dto: ValidarAccesoDto, @CurrentUser() user: AuthenticatedUser) {
    return this.entradasService.validarAcceso(dto.token, user.id);
  }
}
