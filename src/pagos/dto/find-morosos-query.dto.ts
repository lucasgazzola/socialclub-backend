import { IsEnum, IsInt, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export enum CriterioOrdenMorosos {
  MONTO = 'monto',
  PERIODOS = 'periodos',
}

export enum SentidoOrden {
  ASC = 'asc',
  DESC = 'desc',
}

export class FindMorososQueryDto {
  @ApiPropertyOptional({
    description: 'Búsqueda por nombre, apellido o DNI del socio',
    example: 'Pérez',
  })
  @IsOptional()
  @IsString()
  busqueda?: string;

  @ApiPropertyOptional({
    description: 'ID de la categoría de socio para filtrar',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  categoriaId?: number;

  @ApiPropertyOptional({
    description: 'Criterio de ordenamiento: "monto" (deuda total) o "periodos" (cantidad de períodos)',
    enum: CriterioOrdenMorosos,
    default: CriterioOrdenMorosos.MONTO,
  })
  @IsOptional()
  @IsEnum(CriterioOrdenMorosos)
  ordenarPor?: CriterioOrdenMorosos = CriterioOrdenMorosos.MONTO;

  @ApiPropertyOptional({
    description: 'Sentido del ordenamiento: "asc" o "desc"',
    enum: SentidoOrden,
    default: SentidoOrden.DESC,
  })
  @IsOptional()
  @IsEnum(SentidoOrden)
  orden?: SentidoOrden = SentidoOrden.DESC;
}
