import { Body, Controller, Get, HttpCode, Post, Res, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from './types/authenticated-user';

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
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'US-39 — Iniciar sesión' })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const { accessToken, usuario } = await this.authService.login(dto.email, dto.password);
    res.cookie(COOKIE_NAME, accessToken, this.cookieOptions);
    return { usuario };
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(200)
  @ApiOperation({ summary: 'US-40 — Cerrar sesión' })
  async logout(@CurrentUser() user: AuthenticatedUser, @Res({ passthrough: true }) res: Response) {
    await this.authService.logout(user.id);
    // El borrado debe usar los mismos atributos (sameSite/secure/path) con los
    // que se seteó la cookie; si no, el navegador no la elimina cross-site.
    res.clearCookie(COOKIE_NAME, this.cookieOptions);
    return { message: 'Sesión cerrada correctamente' };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  @ApiOperation({ summary: 'Devuelve el usuario de la sesión actual' })
  me(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }
}
