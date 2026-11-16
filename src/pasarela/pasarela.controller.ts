import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { ApiErrores, VALIDACION } from '../common/swagger/respuestas';
import { PasarelaService } from './pasarela.service';
import { ConfirmarOrdenDto } from './dto/confirmar-orden.dto';
import { SimularPagoDto } from './dto/simular-pago.dto';
import { OrdenPagoRespuestaDto } from './dto/orden-pago-respuesta.dto';

const REFERENCIA = new ParseUUIDPipe({ version: '4' });

/**
 * Órdenes de pago online (TASK-51). Cualquier usuario con sesión, pero cada
 * uno solo ve y opera las suyas (lo controla el servicio; ADMIN ve todas).
 * Las órdenes se crean desde cada dominio (`POST /pagos/checkout`,
 * `POST /entradas/checkout`).
 */
@ApiTags('pasarela')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard)
@Controller('pasarela/ordenes')
export class PasarelaController {
  constructor(private readonly pasarela: PasarelaService) {}

  @Get(':referencia')
  @ApiOperation({ summary: 'TASK-51 — Consultar una orden de pago propia' })
  @ApiOkResponse({ description: 'Estado de la orden', type: OrdenPagoRespuestaDto })
  @ApiErrores({
    400: [VALIDACION],
    401: 'Unauthorized',
    403: 'La orden de pago pertenece a otro usuario',
    404: 'Orden de pago no encontrada',
  })
  obtener(
    @Param('referencia', REFERENCIA) referencia: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.pasarela.obtener(referencia, user);
  }

  @Post(':referencia/confirmar')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'TASK-51 — Confirmar el pago al volver de la pasarela (consulta el estado real y acredita)',
  })
  @ApiOkResponse({ description: 'Orden con el estado actualizado', type: OrdenPagoRespuestaDto })
  @ApiErrores({
    400: [VALIDACION, 'El pago informado no corresponde a esta orden'],
    401: 'Unauthorized',
    403: 'La orden de pago pertenece a otro usuario',
    404: 'Orden de pago no encontrada',
    502: 'La pasarela de pagos no respondió. Intentá nuevamente.',
  })
  confirmar(
    @Param('referencia', REFERENCIA) referencia: string,
    @Body() dto: ConfirmarOrdenDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.pasarela.confirmar(referencia, user, dto.idPago);
  }

  @Post(':referencia/cancelar')
  @HttpCode(200)
  @ApiOperation({ summary: 'TASK-51 — Cancelar una orden de pago pendiente propia' })
  @ApiOkResponse({
    description: 'Orden cancelada (o aprobada, si el pago ya había entrado)',
    type: OrdenPagoRespuestaDto,
  })
  @ApiErrores({
    400: [VALIDACION, 'Solo se puede cancelar una orden de pago pendiente'],
    401: 'Unauthorized',
    403: 'La orden de pago pertenece a otro usuario',
    404: 'Orden de pago no encontrada',
    502: 'La pasarela de pagos no respondió. Intentá nuevamente.',
  })
  cancelar(
    @Param('referencia', REFERENCIA) referencia: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.pasarela.cancelar(referencia, user);
  }

  @Post(':referencia/simular')
  @HttpCode(200)
  @ApiOperation({
    summary: 'TASK-51 — Aprobar o rechazar un pago con la pasarela simulada (desarrollo y E2E)',
  })
  @ApiOkResponse({
    description: 'Orden con el resultado del pago simulado',
    type: OrdenPagoRespuestaDto,
  })
  @ApiErrores({
    400: [
      VALIDACION,
      'El simulador solo está disponible con la pasarela simulada',
      'La orden de pago ya no está pendiente',
    ],
    401: 'Unauthorized',
    403: 'La orden de pago pertenece a otro usuario',
    404: 'Orden de pago no encontrada',
  })
  simular(
    @Param('referencia', REFERENCIA) referencia: string,
    @Body() dto: SimularPagoDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.pasarela.simular(referencia, user, dto.aprobado);
  }
}
