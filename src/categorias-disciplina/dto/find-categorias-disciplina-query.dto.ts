import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';

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
}
