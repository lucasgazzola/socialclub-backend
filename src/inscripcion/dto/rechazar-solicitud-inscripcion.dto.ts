import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * US-66: Motivo obligatorio para rechazar una solicitud de inscripción.
 */
export class RechazarSolicitudInscripcionDto {
  @ApiProperty({
    description: 'Motivo del rechazo de la solicitud de inscripción',
    example: 'La categoría completó el cupo disponible para este período.',
  })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'El motivo de rechazo debe ser un texto válido' })
  @IsNotEmpty({ message: 'El motivo de rechazo es obligatorio' })
  @MaxLength(500, { message: 'El motivo de rechazo no puede superar los 500 caracteres' })
  motivo!: string;
}
