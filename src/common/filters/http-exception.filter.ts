import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

/**
 * Normaliza todas las respuestas de error de la API a un mismo formato JSON,
 * de modo que el frontend siempre reciba la misma estructura.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    const cuerpoExcepcion = exception instanceof HttpException ? exception.getResponse() : null;

    const message =
      cuerpoExcepcion && typeof cuerpoExcepcion === 'object'
        ? (cuerpoExcepcion as { message?: string | string[] }).message
        : exception instanceof Error
          ? exception.message
          : 'Error interno del servidor';

    if (status >= 500) {
      this.logger.error(`${request.method} ${request.url}`, (exception as Error)?.stack);
    }

    response.status(status).json({
      statusCode: status,
      path: request.url,
      timestamp: new Date().toISOString(),
      message,
    });
  }
}
