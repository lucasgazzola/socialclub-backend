import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';
import { Transform } from 'class-transformer';

/** US-60 / US-61: motivo obligatorio del rechazo o de la cancelación por la institución. */
export class MotivoReservaDto {
  @ApiProperty({ example: 'El salón está reservado para la fiesta aniversario del club.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'El motivo es obligatorio' })
  @Length(5, 500, { message: 'El motivo debe tener entre 5 y 500 caracteres' })
  motivo: string;
}
