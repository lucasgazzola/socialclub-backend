import { IsOptional, IsString, IsIn, IsBooleanString, IsInt, Min, Max } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class FiltrarEventosDto {
  @ApiPropertyOptional({
    description: 'Texto libre para buscar por nombre o descripción del evento (case-insensitive).',
    example: 'Torneo',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Si es "true", devuelve solo los eventos con entradas disponibles (> 0 o ilimitadas).',
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
    description: 'Campo por el que ordenar los resultados.',
    enum: ['nombre', 'reciente', 'fecha'],
    example: 'fecha',
  })
  @IsOptional()
  @IsIn(['nombre', 'reciente', 'fecha'])
  ordenar?: 'nombre' | 'reciente' | 'fecha';

  @ApiPropertyOptional({ description: 'Número de página (1-indexed)', example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pagina?: number = 1;

  @ApiPropertyOptional({ description: 'Cantidad de elementos por página (máximo 50)', example: 5, default: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  porPagina?: number = 5;
}
