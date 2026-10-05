import { Body, Controller, Get, HttpCode, Patch, Post, Res, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiCreatedResponse, ApiOkResponse } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { CambiarContrasenaDto } from './dto/cambiar-contrasena.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from './types/authenticated-user';
import { ApiErrores, VALIDACION } from '../common/swagger/respuestas';
import { MensajeRespuestaDto, PerfilRespuestaDto, SesionRespuestaDto } from './dto/respuestas.dto';

const COOKIE_NAME = 'access_token';
const COOKIE_MAX_AGE_MS = 8 * 60 * 60 * 1000; // 8 horas, alineado a la jornada operativa

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  private get cookieOptions(): CookieOptions {
    const isProduction = this.config.get<string>('NODE_ENV') === 'production';
    return {
      httpOnly: true,
      // En producción el frontend y la API suelen vivir en dominios distintos
      // (p. ej. Static Web Apps + Container Apps), por lo que la cookie debe ser
      // cross-site: `SameSite=None` lo permite y exige `Secure`. En desarrollo
      // (mismo host, http) usamos `lax` porque `None` requiere HTTPS.
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      maxAge: COOKIE_MAX_AGE_MS,
    };
  }

  @Post('register')
  @ApiOperation({ summary: 'US-38 — Registrarse como usuario' })
  @ApiCreatedResponse({
    description: 'Usuario creado, todavía sin roles (se hace socio con US-09)',
    type: SesionRespuestaDto,
  })
  @ApiErrores({ 400: VALIDACION, 409: 'Ya existe un usuario registrado con ese email' })
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'US-39 — Iniciar sesión' })
  @ApiOkResponse({
    description: 'Sesión iniciada: setea las cookies de acceso y devuelve el usuario',
    type: SesionRespuestaDto,
  })
  @ApiErrores({
    400: VALIDACION,
    401: ['Credenciales inválidas', 'El usuario se encuentra dado de baja'],
  })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const { accessToken, usuario } = await this.authService.login(dto.email, dto.password);
    res.cookie(COOKIE_NAME, accessToken, this.cookieOptions);
    return { usuario };
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(200)
  @ApiOperation({ summary: 'US-40 — Cerrar sesión' })
  @ApiOkResponse({ description: 'Sesión cerrada: borra las cookies', type: MensajeRespuestaDto })
  @ApiErrores({ 401: 'Unauthorized' })
  async logout(@CurrentUser() user: AuthenticatedUser, @Res({ passthrough: true }) res: Response) {
    await this.authService.logout(user.id);
    // El borrado debe usar los mismos atributos (sameSite/secure/path) con los
    // que se seteó la cookie; si no, el navegador no la elimina cross-site.
    res.clearCookie(COOKIE_NAME, this.cookieOptions);
    return { message: 'Sesión cerrada correctamente' };
  }

  @UseGuards(JwtAuthGuard)
  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({
    summary: 'US-09: Re-firma el JWT con los roles actuales (tras hacerse socio)',
  })
  @ApiOkResponse({ description: 'Sesión renovada con un token nuevo', type: SesionRespuestaDto })
  @ApiErrores({ 401: ['Sesión inválida', 'Unauthorized'] })
  async refresh(@CurrentUser() user: AuthenticatedUser, @Res({ passthrough: true }) res: Response) {
    const { accessToken, usuario } = await this.authService.refrescarSesion(user.id);
    res.cookie(COOKIE_NAME, accessToken, this.cookieOptions);
    return { usuario };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  @ApiOperation({ summary: 'Devuelve el usuario de la sesión actual (roles y persona)' })
  @ApiOkResponse({
    description: 'Usuario de la sesión con sus roles y su persona',
    type: PerfilRespuestaDto,
  })
  @ApiErrores({ 401: ['Sesión inválida', 'Unauthorized'] })
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.obtenerPerfil(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('cambiar-contrasena')
  @HttpCode(200)
  @ApiOperation({
    summary: 'US-41 — Cambiar la contraseña del usuario autenticado',
    description:
      'Cualquier usuario con sesión activa cambia su propia contraseña. Exige la contraseña actual; si no coincide, no se modifica nada. Al cambiarla exitosamente, invalida la sesión borrando la cookie para exigir nuevo inicio de sesión.',
  })
  @ApiOkResponse({ description: 'Contraseña actualizada', type: MensajeRespuestaDto })
  @ApiErrores({
    400: [VALIDACION, 'La nueva contraseña no puede ser igual a la actual'],
    401: ['La contraseña actual es incorrecta', 'Sesión inválida', 'Unauthorized'],
  })
  async cambiarContrasena(
    @Body() dto: CambiarContrasenaDto,
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const resultado = await this.authService.cambiarContrasena(user.id, dto);
    res.clearCookie(COOKIE_NAME, this.cookieOptions);
    return resultado;
  }
}
