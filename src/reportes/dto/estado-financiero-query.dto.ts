import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Matches } from 'class-validator';

const PERIODO = /^\d{4}-(0[1-9]|1[0-2])$/;

/** US-35 — Rango de meses del reporte y filtro opcional por disciplina. */
export class EstadoFinancieroQueryDto {
  @ApiProperty({ example: '2026-07', description: 'Primer mes del reporte (AAAA-MM)' })
  @Matches(PERIODO, { message: 'El período «desde» debe tener formato AAAA-MM' })
  desde: string;

  @ApiProperty({ example: '2026-09', description: 'Último mes del reporte (AAAA-MM), inclusive' })
  @Matches(PERIODO, { message: 'El período «hasta» debe tener formato AAAA-MM' })
  hasta: string;

  @ApiPropertyOptional({
    example: 1,
    description: 'Solo la cuota deportiva de esa disciplina (sin cuota social)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  disciplinaId?: number;
}
