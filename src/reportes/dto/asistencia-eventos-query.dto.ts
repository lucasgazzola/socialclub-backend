import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional } from 'class-validator';
import { EstadoEvento } from '@prisma/client';

/** US-36 — Filtros opcionales para el reporte de asistencia a eventos. */
export class AsistenciaEventosQueryDto {
  @ApiPropertyOptional({
    description: 'Filtrar métricas de un evento puntual por su ID',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  eventoId?: number;

  @ApiPropertyOptional({
    description: 'Fecha inicial para filtrar eventos (formato ISO o YYYY-MM-DD)',
    example: '2026-08-01',
  })
  @IsOptional()
  @IsDateString()
  desde?: string;

  @ApiPropertyOptional({
    description: 'Fecha final para filtrar eventos (formato ISO o YYYY-MM-DD)',
    example: '2026-12-31',
  })
  @IsOptional()
  @IsDateString()
  hasta?: string;

  @ApiPropertyOptional({
    description: 'Filtrar por estado del evento',
    enum: EstadoEvento,
    example: EstadoEvento.FINALIZADO,
  })
  @IsOptional()
  @IsEnum(EstadoEvento)
  estado?: EstadoEvento;
}
