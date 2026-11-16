import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, ValidateNested } from 'class-validator';

export class DisciplinaReactivacionDto {
  @IsInt()
  disciplinaId!: number;

  @IsOptional()
  @IsInt()
  categoriaDisciplinaId?: number;
}

export class ActivarParticipanteDto {
  @ApiPropertyOptional({
    description:
      'Disciplinas (y categorías opcionales) a inscribir o reactivar junto con el alta del participante',
    type: [DisciplinaReactivacionDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DisciplinaReactivacionDto)
  disciplinas?: DisciplinaReactivacionDto[];
}
