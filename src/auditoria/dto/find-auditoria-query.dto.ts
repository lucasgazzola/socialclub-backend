import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsISO8601, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { AccionAuditoria } from '@prisma/client';

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