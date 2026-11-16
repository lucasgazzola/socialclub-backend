import {
  IsOptional,
  IsString,
  IsIn,
  IsBooleanString,
  IsInt,
  IsEnum,
  Min,
  Max,
  IsDateString,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { EstadoEvento } from '@prisma/client';

export class FiltrarEventosDto {
  @ApiPropertyOptional({
    description: 'Texto libre para buscar por nombre o descripción del evento (case-insensitive).',
    example: 'Torneo',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description:
      'Si es "true", devuelve solo los eventos con entradas disponibles (> 0 o ilimitadas).',
    example: 'true',
  })
  @IsOptional()
  @IsBooleanString()
  soloDisponibles?: string;

  @ApiPropertyOptional({
    description: 'Si es "true" y el usuario es ADMIN, incluye eventos en estado BORRADOR.',
    example: 'true',
  })
  @IsOptional()
  @IsBooleanString()
  incluirBorradores?: string;

  @ApiPropertyOptional({
    description: 'Segmenta el listado por estado. BORRADOR solo se aplica si el usuario es ADMIN.',
    enum: EstadoEvento,
  })
  @IsOptional()
  @IsEnum(EstadoEvento)
  estado?: EstadoEvento;

  @ApiPropertyOptional({
    description:
      'Fecha desde para filtrar eventos por fecha de realización (inclusive, ISO 8601 o YYYY-MM-DD).',
    example: '2026-10-01',
  })
  @IsOptional()
  @IsDateString()
  fechaDesde?: string;

  @ApiPropertyOptional({
    description:
      'Fecha hasta para filtrar eventos por fecha de realización (inclusive, ISO 8601 o YYYY-MM-DD).',
    example: '2026-10-31',
  })
  @IsOptional()
  @IsDateString()
  fechaHasta?: string;

  @ApiPropertyOptional({
    description: 'Campo por el que ordenar los resultados.',
    enum: ['nombre', 'reciente', 'fecha', 'precio'],
    example: 'fecha',
  })
  @IsOptional()
  @IsIn(['nombre', 'reciente', 'fecha', 'precio'])
  ordenar?: 'nombre' | 'reciente' | 'fecha' | 'precio';

  @ApiPropertyOptional({ description: 'Número de página (1-indexed)', example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pagina?: number = 1;

  @ApiPropertyOptional({ description: 'Alias de pagina (1-indexed)', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    description: 'Cantidad de elementos por página (máximo 50)',
    example: 5,
    default: 5,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  porPagina?: number = 5;

  @ApiPropertyOptional({ description: 'Alias de porPagina (máximo 50)', example: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
