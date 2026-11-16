import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CriterioOrdenMorosos, SentidoOrden } from './find-morosos-query.dto';

/** US-23 — Filtros del listado de morosos de cuota deportiva (mismo contrato que US-19). */
export class FindMorososDeportivosQueryDto {
  @ApiPropertyOptional({
    description: 'Búsqueda por nombre, apellido o DNI del participante',
    example: 'Pérez',
  })
  @IsOptional()
  @IsString()
  busqueda?: string;

  @ApiPropertyOptional({
    description: 'ID de la disciplina: solo morosos y deudas de esa disciplina',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  disciplinaId?: number;

  @ApiPropertyOptional({
    description: 'Criterio de orden: "monto" (deuda total) o "periodos" (cantidad de períodos)',
    enum: CriterioOrdenMorosos,
    default: CriterioOrdenMorosos.MONTO,
  })
  @IsOptional()
  @IsEnum(CriterioOrdenMorosos)
  ordenarPor?: CriterioOrdenMorosos = CriterioOrdenMorosos.MONTO;

  @ApiPropertyOptional({
    description: 'Sentido del orden: "asc" o "desc"',
    enum: SentidoOrden,
    default: SentidoOrden.DESC,
  })
  @IsOptional()
  @IsEnum(SentidoOrden)
  orden?: SentidoOrden = SentidoOrden.DESC;

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
