import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { ApiErrores, VALIDACION } from '../common/swagger/respuestas';
import { OrdenPagoRespuestaDto } from '../pasarela/dto/orden-pago-respuesta.dto';
import { ReservasService } from './reservas.service';
import { FindSolicitudesQueryDto } from './dto/find-solicitudes-query.dto';
import { MotivoReservaDto } from './dto/motivo.dto';
import { RegistrarSenaDto } from './dto/registrar-sena.dto';

const SIN_PERMISO = 'No tenés permisos suficientes para esta operación';
const NO_ENCONTRADA = 'Reserva no encontrada';
const CAMBIO_ESTADO = 'La reserva cambió de estado mientras tanto. Actualizá la página.';

/**
 * Reservas de espacios (US-60, US-61, US-62). La bandeja y las acciones de la
 * administración son de ADMIN y COLABORADOR; «Mis Reservas», la cancelación
 * propia y el pago de la seña son de cualquier usuario con sesión, sobre sus
 * propias reservas (lo controla el servicio).
 */
@ApiTags('reservas')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('reservas')
export class ReservasController {
  constructor(private readonly reservas: ReservasService) {}

  // ── Administración (US-60, US-61) ─────────────────────────────────────────

  @Get('solicitudes')
  @Roles('ADMIN', 'COLABORADOR')
  @ApiOperation({
    summary: 'US-60 — Bandeja de solicitudes de reserva (por defecto, las pendientes)',
  })
  @ApiOkResponse({
    description:
      'Reservas ordenadas por fecha del turno y de solicitud, con el solicitante y su condición',
  })
  @ApiErrores({ 400: [VALIDACION], 401: 'Unauthorized', 403: SIN_PERMISO })
  listarSolicitudes(@Query() query: FindSolicitudesQueryDto) {
    return this.reservas.listarSolicitudes(query);
  }

  @Patch(':id/aprobar')
  @Roles('ADMIN', 'COLABORADOR')
  @ApiOperation({
    summary: 'US-60 — Aprobar una solicitud: fija el plazo de la seña y bloquea el turno',
  })
  @ApiOkResponse({ description: 'Solicitud aprobada' })
  @ApiErrores({
    400: [VALIDACION, 'Solo se pueden aprobar solicitudes pendientes de aprobación'],
    401: 'Unauthorized',
    403: SIN_PERMISO,
    404: NO_ENCONTRADA,
    409: ['El turno ya no está disponible: se superpone con …', CAMBIO_ESTADO],
  })
  aprobar(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser) {
    return this.reservas.aprobar(id, user.id);
  }

  @Patch(':id/rechazar')
  @Roles('ADMIN', 'COLABORADOR')
  @ApiOperation({
    summary: 'US-60 — Rechazar una solicitud con motivo obligatorio (avisa al solicitante)',
  })
  @ApiOkResponse({ description: 'Solicitud rechazada' })
  @ApiErrores({
    400: [
      VALIDACION,
      'El motivo es obligatorio',
      'Solo se pueden rechazar solicitudes pendientes de aprobación',
    ],
    401: 'Unauthorized',
    403: SIN_PERMISO,
    404: NO_ENCONTRADA,
    409: CAMBIO_ESTADO,
  })
  rechazar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MotivoReservaDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reservas.rechazar(id, dto.motivo, user.id);
  }

  @Post(':id/sena')
  @HttpCode(200)
  @Roles('ADMIN', 'COLABORADOR')
  @ApiOperation({
    summary: 'US-60 — Registrar el cobro de la seña en secretaría (confirma la reserva)',
  })
  @ApiOkResponse({ description: 'Seña registrada y reserva confirmada' })
  @ApiErrores({
    400: [VALIDACION, 'Solo se puede registrar la seña de una reserva aprobada pendiente de pago'],
    401: 'Unauthorized',
    403: SIN_PERMISO,
    404: NO_ENCONTRADA,
    409: CAMBIO_ESTADO,
  })
  registrarSena(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RegistrarSenaDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reservas.registrarSena(id, dto.metodoPago, user.id);
  }

  @Post(':id/cancelar-institucion')
  @HttpCode(200)
  @Roles('ADMIN', 'COLABORADOR')
  @ApiOperation({ summary: 'US-61 — Cancelar una reserva por prioridad institucional, con motivo' })
  @ApiOkResponse({ description: 'Reserva cancelada por la institución' })
  @ApiErrores({
    400: [
      VALIDACION,
      'El motivo es obligatorio',
      'Una solicitud pendiente se rechaza, no se cancela',
      'La reserva ya no está vigente: fue rechazada o cancelada',
    ],
    401: 'Unauthorized',
    403: SIN_PERMISO,
    404: NO_ENCONTRADA,
    409: CAMBIO_ESTADO,
  })
  cancelarPorInstitucion(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MotivoReservaDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reservas.cancelarPorInstitucion(id, dto.motivo, user.id);
  }

  @Post(':id/cancelar-falta-pago')
  @HttpCode(200)
  @Roles('ADMIN', 'COLABORADOR')
  @ApiOperation({ summary: 'US-61 — Cancelar por falta de pago una reserva con la seña vencida' })
  @ApiOkResponse({ description: 'Reserva cancelada por falta de pago' })
  @ApiErrores({
    400: [
      VALIDACION,
      'Solo se cancela por falta de pago una reserva aprobada pendiente de pago',
      'El plazo para pagar la seña todavía no venció (vence el …).',
    ],
    401: 'Unauthorized',
    403: SIN_PERMISO,
    404: NO_ENCONTRADA,
    409: CAMBIO_ESTADO,
  })
  cancelarPorFaltaPago(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reservas.cancelarPorFaltaPago(id, user.id);
  }

  // ── Solicitante (US-61, US-62) ────────────────────────────────────────────

  @Get('mias')
  @ApiOperation({ summary: 'US-62 — Mis Reservas: reservas del usuario autenticado' })
  @ApiOkResponse({ description: 'Reservas del usuario, de la más reciente a la más antigua' })
  @ApiErrores({ 401: 'Unauthorized' })
  misReservas(@CurrentUser() user: AuthenticatedUser) {
    return this.reservas.misReservas(user.id);
  }

  @Post(':id/cancelar')
  @HttpCode(200)
  @ApiOperation({ summary: 'US-61 — Cancelar una reserva propia antes del plazo de penalización' })
  @ApiOkResponse({ description: 'Reserva cancelada por el solicitante' })
  @ApiErrores({
    400: [
      VALIDACION,
      'La reserva ya no está vigente: fue rechazada o cancelada',
      'Solo podés cancelar hasta … horas antes del turno (límite: …). Comunicate con la secretaría del club.',
    ],
    401: 'Unauthorized',
    403: 'La reserva pertenece a otro usuario',
    404: NO_ENCONTRADA,
    409: CAMBIO_ESTADO,
  })
  cancelar(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser) {
    return this.reservas.cancelarPorUsuario(id, user.id);
  }

  @Post(':id/sena/checkout')
  @ApiOperation({
    summary: 'US-60 — Pagar la seña online (devuelve la orden con la URL de la pasarela)',
  })
  @ApiCreatedResponse({ description: 'Orden de pago creada', type: OrdenPagoRespuestaDto })
  @ApiErrores({
    400: [
      VALIDACION,
      'Solo se puede pagar la seña de una reserva aprobada pendiente de pago',
      'Venció el plazo para pagar la seña. Comunicate con la secretaría del club.',
    ],
    401: 'Unauthorized',
    403: 'La reserva pertenece a otro usuario',
    404: NO_ENCONTRADA,
    502: 'La pasarela de pagos no respondió. Intentá nuevamente.',
  })
  pagarSena(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser) {
    return this.reservas.iniciarPagoSena(id, user.id);
  }
}
