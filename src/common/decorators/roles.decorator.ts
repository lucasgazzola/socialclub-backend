import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/**
 * Marca un controlador o handler con los roles habilitados para usarlo.
 * Debe combinarse con `JwtAuthGuard` y `RolesGuard`.
 *
 * @example
 * @Roles('ADMIN')
 * @UseGuards(JwtAuthGuard, RolesGuard)
 * @Delete(':id')
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
