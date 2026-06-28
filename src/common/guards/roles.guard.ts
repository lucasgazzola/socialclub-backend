import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { AuthenticatedUser } from '../../auth/types/authenticated-user';

/**
 * Autoriza el acceso comparando los roles requeridos por el handler (vía el
 * decorador @Roles) contra los roles del usuario autenticado (RNF06).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as AuthenticatedUser | undefined;

    const tienePermiso = !!user?.roles?.some((rol) => requiredRoles.includes(rol));
    if (!tienePermiso) {
      throw new ForbiddenException('No tenés permisos suficientes para esta operación');
    }

    return true;
  }
}
