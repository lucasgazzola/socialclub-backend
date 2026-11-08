import {
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TipoBloqueo } from '@prisma/client';

export class CreateBloqueoDto {
  @ApiProperty({ enum: TipoBloqueo, example: TipoBloqueo.RECURRENTE })
  @IsEnum(TipoBloqueo, { message: 'El tipo de bloqueo debe ser RECURRENTE o PUNTUAL' })
  tipo: TipoBloqueo;

  @ApiPropertyOptional({
    description: 'Días de la semana para bloqueo recurrente (0 = domingo ... 6 = sábado)',
    example: [1, 3, 5],
  })
  @IsOptional()
  @IsArray({ message: 'diasSemana debe ser un arreglo de números' })
  @IsInt({ each: true, message: 'Cada día de la semana debe ser un número entero' })
  @Min(0, { each: true, message: 'El día de la semana mínimo es 0 (domingo)' })
  @Max(6, { each: true, message: 'El día de la semana máximo es 6 (sábado)' })
  diasSemana?: number[];

  @ApiPropertyOptional({
    description: 'Fecha específica para bloqueo puntual (YYYY-MM-DD)',
    example: '2026-11-20',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'La fecha debe tener formato YYYY-MM-DD' })
  fecha?: string;

  @ApiPropertyOptional({ description: 'Hora de inicio ("HH:MM")', example: '18:00' })
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, { message: 'La hora de inicio debe tener formato HH:MM' })
  horaInicio?: string;

  @ApiPropertyOptional({ description: 'Hora de fin ("HH:MM")', example: '20:00' })
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, { message: 'La hora de fin debe tener formato HH:MM' })
  horaFin?: string;

  @ApiPropertyOptional({
    description: 'Fecha desde cuándo rige el bloqueo recurrente (YYYY-MM-DD)',
    example: '2026-11-01',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'vigenteDesde debe tener formato YYYY-MM-DD' })
  vigenteDesde?: string;

  @ApiPropertyOptional({
    description: 'Fecha límite de vigencia del bloqueo recurrente (YYYY-MM-DD)',
    example: '2026-12-31',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'vigenteHasta debe tener formato YYYY-MM-DD' })
  vigenteHasta?: string;

  @ApiPropertyOptional({ description: 'ID de la disciplina asociada al bloqueo', example: 1 })
  @IsOptional()
  @IsInt({ message: 'disciplinaId debe ser un número entero' })
  disciplinaId?: number;

  @ApiPropertyOptional({ description: 'Motivo o detalle del bloqueo', example: 'Entrenamiento Fútbol Mayor' })
  @IsOptional()
  @IsString()
  motivo?: string;
}
