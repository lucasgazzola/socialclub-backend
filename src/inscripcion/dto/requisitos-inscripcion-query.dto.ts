import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

/** US-05: qué se le va a exigir a una inscripción antes de confirmarla. */
export class RequisitosInscripcionQueryDto {
  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt({ message: 'Debe indicar la disciplina' })
  @Min(1)
  disciplinaId: number;

  @ApiPropertyOptional({ example: 7 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoriaDisciplinaId?: number;

  @ApiPropertyOptional({
    example: 10,
    description: 'Si la persona ya existe, se indica qué documentos ya presentó.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  personaId?: number;
}
