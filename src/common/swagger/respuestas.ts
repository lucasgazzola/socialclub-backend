import { applyDecorators } from '@nestjs/common';
import { ApiProperty, ApiResponse } from '@nestjs/swagger';

/**
 * DT-26 — Respuestas de la API en Swagger.
 *
 * Todos los errores salen con el mismo formato (`HttpExceptionFilter`); este
 * DTO lo describe para que el contrato lo muestre en cada operación.
 */
export class ErrorRespuestaDto {
  @ApiProperty({ example: 400 })
  statusCode: number;

  @ApiProperty({ example: '/api/v1/usuarios/5' })
  path: string;

  @ApiProperty({ example: '2026-10-04T12:00:00.000Z' })
  timestamp: string;

  @ApiProperty({
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
    example: 'Usuario no encontrado',
    description: 'Mensaje en español. Los errores de validación de un DTO llegan como lista.',
  })
  message: string | string[];
}

export type CodigoError = 400 | 401 | 403 | 404 | 409 | 413;

/** Qué significa cada código en esta API. */
const SIGNIFICADO: Record<CodigoError, string> = {
  400: 'Datos inválidos o regla de negocio incumplida',
  401: 'Sin sesión, sesión vencida o credenciales inválidas',
  403: 'El rol del usuario no tiene permiso para esta operación',
  404: 'No existe el recurso indicado',
  409: 'Conflicto con el estado actual de los datos',
  413: 'El archivo supera el tamaño máximo permitido',
};

/** Mensajes reales que puede devolver un código (los que relevaron los casos de prueba). */
export type ErroresDeOperacion = Partial<Record<CodigoError, string | string[] | true>>;

/**
 * Declara las respuestas de error de una operación (o de todo un controller,
 * si se aplica a la clase). `true` deja solo el significado general; con
 * mensajes, se listan como ejemplos en la descripción.
 *
 * ```ts
 * @ApiErrores({ 404: 'Usuario no encontrado', 409: ['Ya existe otro usuario con ese email'] })
 * ```
 */
export function ApiErrores(errores: ErroresDeOperacion) {
  return applyDecorators(
    ...Object.entries(errores).map(([codigo, mensajes]) => {
      const status = Number(codigo) as CodigoError;
      const lista = mensajes === true ? [] : ([] as string[]).concat(mensajes ?? []);
      const description = lista.length
        ? `${SIGNIFICADO[status]}. Por ejemplo: ${lista.map((m) => `«${m}»`).join(' · ')}`
        : SIGNIFICADO[status];
      return ApiResponse({ status, description, type: ErrorRespuestaDto });
    }),
  );
}

/** 400 que agrega el `ValidationPipe` global a toda operación con body, query o parámetros. */
export const VALIDACION = 'Datos de entrada inválidos (validación del DTO o de los parámetros)';

/** Errores de los guards de sesión y roles, para aplicar a nivel de controller. */
export function ApiErroresDeSesion({ conRoles = true }: { conRoles?: boolean } = {}) {
  return ApiErrores({
    401: 'Unauthorized',
    ...(conRoles ? { 403: 'No tenés permisos suficientes para esta operación' } : {}),
  });
}
