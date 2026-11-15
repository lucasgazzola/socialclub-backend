import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { EstadoEntrada } from '@prisma/client';

export class FiltrarMisEntradasDto {
  @ApiPropertyOptional({
    description: 'Texto libre para buscar por nombre del evento (case-insensitive).',
    example: 'Torneo',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Alias de search (búsqueda libre).',
    example: 'Torneo',
  })
  @IsOptional()
  @IsString()
  busqueda?: string;

  @ApiPropertyOptional({
    description: 'Filtrar por estado de la entrada.',
    enum: EstadoEntrada,
    example: EstadoEntrada.VALIDA,
  })
  @IsOptional()
  @IsEnum(EstadoEntrada)
  estado?: EstadoEntrada;

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
    example: 10,
    default: 10,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  porPagina?: number = 10;

  @ApiPropertyOptional({ description: 'Alias de porPagina (máximo 50)', example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

