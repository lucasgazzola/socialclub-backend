import { IsOptional, IsString, IsIn, IsBooleanString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class FiltrarEventosDto {
  @ApiPropertyOptional({
    description: 'Texto libre para buscar por nombre o descripción del evento (case-insensitive).',
    example: 'Torneo',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Si es "true", devuelve solo los eventos con entradas disponibles (> 0).',
    example: 'true',
  })
  @IsOptional()
  @IsBooleanString()
  soloDisponibles?: string;

  @ApiPropertyOptional({
    description: 'Campo por el que ordenar los resultados.',
    enum: ['nombre', 'reciente'],
    example: 'reciente',
  })
  @IsOptional()
  @IsIn(['nombre', 'reciente'])
  ordenar?: 'nombre' | 'reciente';
}
