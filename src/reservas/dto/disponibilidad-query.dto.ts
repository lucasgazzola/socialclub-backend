import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Matches, Min } from 'class-validator';

const FECHA_ISO_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/** US-59: consulta de disponibilidad de un espacio en un rango de fechas. */
export class DisponibilidadQueryDto {
  @ApiProperty({ description: 'ID del espacio a consultar', example: 1 })
  @Type(() => Number)
  @IsInt({ message: 'El espacioId debe ser un número entero' })
  @Min(1, { message: 'El espacioId debe ser mayor a 0' })
  espacioId!: number;

  @ApiProperty({
    description: 'Fecha de inicio (YYYY-MM-DD, hora del club)',
    example: '2026-11-01',
  })
  @Matches(FECHA_ISO_REGEX, { message: 'La fecha desde debe tener formato YYYY-MM-DD' })
  desde!: string;

  @ApiProperty({ description: 'Fecha de fin (YYYY-MM-DD, hora del club)', example: '2026-11-30' })
  @Matches(FECHA_ISO_REGEX, { message: 'La fecha hasta debe tener formato YYYY-MM-DD' })
  hasta!: string;
}
