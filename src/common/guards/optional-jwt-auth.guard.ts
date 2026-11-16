import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Permite acceso tanto a usuarios autenticados como anónimos.
 * Si la cookie `access_token` contiene un JWT válido, inyecta el usuario
 * en `req.user`. Si no hay token o no es válido, continúa sin lanzar 401 Unauthorized.
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = any>(_err: any, user: any): TUser {
    return (user || null) as TUser;
  }
}
