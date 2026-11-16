import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiErrores, VALIDACION } from '../common/swagger/respuestas';
import { VerificacionEmailService } from './verificacion-email.service';
import {
  ConsultaVerificacionRespuestaDto,
  MensajeVerificacionDto,
  TokenVerificacionDto,
  VerificarEmailDto,
} from './dto/verificacion-email.dto';

const ENLACE_INVALIDO = [
  'Este enlace ya fue usado. Si ya verificaste tu email, iniciá sesión.',
  'Este enlace fue reemplazado por uno más nuevo. Usá el último que te enviamos.',
  'El enlace venció. Pedile al club que te envíe uno nuevo.',
  'La cuenta está dada de baja',
];

/**
 * DT-54 — Endpoints públicos del enlace de verificación (decisión 0005).
 * El token viaja en el body (no en la URL de la API) para que no quede en
 * los logs de acceso.
 */
@ApiTags('auth')
@Controller('auth/verificacion')
export class VerificacionEmailController {
  constructor(private readonly verificacion: VerificacionEmailService) {}

  @Post('consultar')
  @HttpCode(200)
  @ApiOperation({ summary: 'DT-54 — Consultar un enlace de verificación antes de usarlo' })
  @ApiOkResponse({
    description: 'El enlace sirve: a quién pertenece y si tiene que elegir contraseña',
    type: ConsultaVerificacionRespuestaDto,
  })
  @ApiErrores({ 400: [VALIDACION, ...ENLACE_INVALIDO], 404: 'El enlace no es válido' })
  consultar(@Body() dto: TokenVerificacionDto) {
    return this.verificacion.consultar(dto.token);
  }

  @Post()
  @HttpCode(200)
  @ApiOperation({
    summary: 'DT-54 — Verificar el email (y elegir la contraseña si la cuenta no tiene)',
  })
  @ApiOkResponse({
    description: 'Email verificado: la cuenta ya puede iniciar sesión',
    type: MensajeVerificacionDto,
  })
  @ApiErrores({
    400: [VALIDACION, 'Elegí una contraseña para tu cuenta', ...ENLACE_INVALIDO],
    404: 'El enlace no es válido',
    409: 'Este enlace ya fue usado. Si ya verificaste tu email, iniciá sesión.',
  })
  verificar(@Body() dto: VerificarEmailDto) {
    return this.verificacion.verificar(dto.token, dto.password);
  }
}
