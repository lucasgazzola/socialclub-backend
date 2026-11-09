import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsPositive } from 'class-validator';

export class SolicitarInscripcionDto {
  @ApiProperty({ description: 'ID de la disciplina', example: 1 })
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  disciplinaId: number;

  @ApiPropertyOptional({
    description: 'ID de la categoría dentro de la disciplina (si la disciplina posee categorías)',
    example: 2,
  })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @IsPositive()
  categoriaDisciplinaId?: number;
}

