import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsISO8601, IsOptional, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { AccionAuditoria } from '@prisma/client';

export enum PeriodoAuditoria {
  ULTIMA_HORA = '1h',
  ULTIMAS_24H = '24h',
  ULTIMOS_7D = '7d',
  PERSONALIZADO = 'personalizado',
}

export class FindAuditoriaQueryDto {
  @ApiPropertyOptional({ enum: AccionAuditoria })
  @IsOptional()
  @IsEnum(AccionAuditoria)
  accion?: AccionAuditoria;

  @ApiPropertyOptional({ example: 'Persona' })
  @IsOptional()
  entidad?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  responsableId?: number;

  @ApiPropertyOptional({
    description: 'Filtro rápido por período de tiempo (1h, 24h, 7d, personalizado)',
    enum: PeriodoAuditoria,
    example: PeriodoAuditoria.ULTIMOS_7D,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toLowerCase().trim() : value,
  )
  @IsEnum(PeriodoAuditoria)
  periodo?: PeriodoAuditoria;

  @ApiPropertyOptional({
    description: 'Alias de periodo para compatibilidad',
    enum: PeriodoAuditoria,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toLowerCase().trim() : value,
  )
  @IsEnum(PeriodoAuditoria)
  rango?: PeriodoAuditoria;

  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsOptional()
  @IsISO8601()
  fechaDesde?: string;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @IsISO8601()
  fechaHasta?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pagina?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  porPagina?: number = 20;
}
