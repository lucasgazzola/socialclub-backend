import { Body, Controller, Get, HttpCode, Post, Res, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
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
    return {
      httpOnly: true,
      secure: this.config.get<string>('NODE_ENV') === 'production',
      sameSite: 'lax',
      maxAge: COOKIE_MAX_AGE_MS,
    };
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
    res.clearCookie(COOKIE_NAME);
    return { message: 'Sesión cerrada correctamente' };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  @ApiOperation({ summary: 'Devuelve el usuario de la sesión actual' })
  me(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }
}
