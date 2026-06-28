import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Protege endpoints exigiendo un JWT válido. El token se lee desde la cookie
 * httpOnly `access_token` seteada en /auth/login (ver JwtStrategy).
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
