import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, Matches } from 'class-validator';

/**
 * US-22 — Filtros para consultar el historial de cuotas deportivas.
 * El rango de fechas se aplica sobre la fecha de pago (YYYY-MM-DD).
 */
export class HistorialDeportivoQueryDto {
  @ApiPropertyOptional({
    description: 'Fecha de pago desde (inclusive), formato YYYY-MM-DD',
    example: '2026-01-01',
  })
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, {
    message: 'La fecha "desde" debe tener el formato YYYY-MM-DD',
  })
  desde?: string;

  @ApiPropertyOptional({
    description: 'Fecha de pago hasta (inclusive), formato YYYY-MM-DD',
    example: '2026-12-31',
  })
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, {
    message: 'La fecha "hasta" debe tener el formato YYYY-MM-DD',
  })
  hasta?: string;
}
