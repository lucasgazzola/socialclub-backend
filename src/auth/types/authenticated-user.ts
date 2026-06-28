/** Estructura del payload firmado dentro del JWT. */
export interface JwtPayload {
  sub: number;
  email: string;
  roles: string[];
}

/** Usuario autenticado disponible en `request.user` tras validar el JWT. */
export interface AuthenticatedUser {
  id: number;
  email: string;
  roles: string[];
}
