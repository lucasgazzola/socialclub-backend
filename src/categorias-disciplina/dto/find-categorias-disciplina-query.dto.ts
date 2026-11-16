import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export enum EstadoCategoriaFiltro {
  ACTIVA = 'ACTIVA',
  INACTIVA = 'INACTIVA',
}

/** US-51 — Consultar categorías de una disciplina (búsqueda por nombre y filtro por estado). */
export class FindCategoriasDisciplinaQueryDto {
  @ApiPropertyOptional({ description: 'Búsqueda por nombre', example: 'sub' })
  @IsOptional()
  @IsString()
  busqueda?: string;

  @ApiPropertyOptional({ enum: EstadoCategoriaFiltro })
  @IsOptional()
  @IsEnum(EstadoCategoriaFiltro)
  estado?: EstadoCategoriaFiltro;

  @ApiPropertyOptional({ description: 'Número de página (desde 1)', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pagina?: number;

  @ApiPropertyOptional({
    description: 'Cantidad de elementos por página',
    example: 10,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  porPagina?: number;
}
