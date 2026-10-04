import { Body, Controller, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiTags,
  ApiCreatedResponse,
  ApiOkResponse,
} from '@nestjs/swagger';
import { EntradasService } from './entradas.service';
import { CrearEntradasDto } from './dto/crear-entradas.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { ValidarEntradaDto } from './dto/validar-entrada.dto';
import { ComprarEntradasDto } from './dto/comprar-entradas.dto';
import { ApiErrores, VALIDACION } from '../common/swagger/respuestas';

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
  @ApiCreatedResponse({ description: 'Entradas generadas con su código QR' })
  @ApiErrores({
    400: [
      VALIDACION,
      'El evento no tiene un cupo de entradas definido para generar entradas.',
      'No hay suficientes entradas disponibles para el evento "…".',
      'No hay suficientes entradas disponibles. Quedan ….',
      'No se pueden generar entradas: el evento "…" ya terminó o fue cancelado.',
    ],
    401: 'Unauthorized',
    403: 'No tenés permisos suficientes para esta operación',
    404: 'Evento no encontrado',
    409: 'No se pudieron generar identificadores únicos',
  })
  crearMultiples(@Body() dto: CrearEntradasDto, @CurrentUser() user: AuthenticatedUser) {
    return this.entradasService.crearMultiples(dto, user.id);
  }

  @Post('validar')
  @Roles('ADMIN', 'COLABORADOR')
  @ApiOperation({ summary: 'US-31 — Validar acceso mediante lectura de QR' })
  @ApiCreatedResponse({ description: 'Acceso permitido: la entrada queda usada' })
  @ApiErrores({
    400: [VALIDACION, 'Entrada expirada para el evento "…".'],
    401: 'Unauthorized',
    403: 'No tenés permisos suficientes para esta operación',
    404: 'Entrada no encontrada. El código QR no es válido.',
    409: [
      'Entrada ya utilizada para el evento "…". Posible intento de reingreso no autorizado.',
      'La entrada ya fue utilizada o no es válida.',
    ],
  })
  validarAcceso(@Body() dto: ValidarEntradaDto, @CurrentUser() user: AuthenticatedUser) {
    return this.entradasService.validarAcceso(dto, user.id);
  }

  @Post('comprar')
  @ApiOperation({ summary: 'US-52 — Comprar entradas con pasarela mock' })
  @ApiCreatedResponse({ description: 'Compra confirmada con sus entradas' })
  @ApiErrores({
    400: [
      VALIDACION,
      'El evento es de acceso libre y no requiere compra de entradas.',
      'El evento no está publicado.',
      'El evento ya terminó.',
      'La venta de entradas aún no ha comenzado.',
      'La venta de entradas para este evento ha finalizado.',
      'Las entradas se agotaron. Actualizá la página e intentá nuevamente.',
      'No hay suficientes entradas disponibles.',
    ],
    401: 'Unauthorized',
    404: 'Evento no encontrado',
  })
  comprar(@Body() dto: ComprarEntradasDto, @CurrentUser() user: AuthenticatedUser) {
    return this.entradasService.comprar(dto, user.id);
  }

  @Get('mis-entradas')
  @ApiOperation({ summary: 'US-52 — Listar entradas del usuario autenticado' })
  @ApiOkResponse({ description: 'Entradas del usuario' })
  @ApiErrores({ 401: 'Unauthorized' })
  misEntradas(@CurrentUser() user: AuthenticatedUser) {
    return this.entradasService.listarMisEntradas(user.id);
  }

  @Get('evento/:eventoId')
  @Roles('ADMIN', 'COLABORADOR')
  @ApiOperation({ summary: 'Listar entradas de un evento' })
  @ApiOkResponse({ description: 'Entradas del evento' })
  @ApiErrores({
    400: VALIDACION,
    401: 'Unauthorized',
    403: 'No tenés permisos suficientes para esta operación',
    404: 'Evento no encontrado',
  })
  listarPorEvento(@Param('eventoId', ParseIntPipe) eventoId: number) {
    return this.entradasService.listarPorEvento(eventoId);
  }
}
