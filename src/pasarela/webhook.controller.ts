import { Body, Controller, Headers, HttpCode, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiErrores } from '../common/swagger/respuestas';
import { PasarelaService } from './pasarela.service';

/**
 * Webhook de la pasarela (TASK-51). Público a propósito: lo llama Mercado
 * Pago, sin sesión. La autenticidad la da la firma (`MP_WEBHOOK_SECRET`) y,
 * sobre todo, que el estado del pago se vuelve a consultar a la pasarela: el
 * cuerpo del aviso nunca se toma como prueba de pago.
 */
@ApiTags('pasarela')
@Controller('pasarela/webhook')
export class WebhookController {
  constructor(private readonly pasarela: PasarelaService) {}

  @Post()
  @HttpCode(200)
  @ApiOperation({ summary: 'TASK-51 — Notificaciones de pago de la pasarela (webhook)' })
  @ApiOkResponse({ description: 'Notificación recibida' })
  @ApiErrores({
    401: 'Firma del webhook inválida',
    502: 'La pasarela de pagos no respondió. Intentá nuevamente.',
  })
  async recibir(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Query() query: Record<string, unknown>,
    @Body() body: unknown,
  ) {
    await this.pasarela.procesarNotificacion({ headers, query, body });
    return { recibido: true };
  }
}
