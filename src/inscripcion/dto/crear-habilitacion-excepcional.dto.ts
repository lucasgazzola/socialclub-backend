import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsString, Min, MinLength } from 'class-validator';

/**
 * US-28: Habilitar participante con documentación vencida.
 * DTO para registrar la excepción administrativa temporal.
 */
export class CrearHabilitacionExcepcionalDto {
  @ApiProperty({
    description: 'Motivo justificado del levantamiento del bloqueo documental',
    example: 'Turno médico de aptitud física reprogramado por la clínica para fin de mes.',
    minLength: 5,
  })
  @IsString({ message: 'El motivo debe ser una cadena de texto.' })
  @IsNotEmpty({
    message: 'El motivo escrito es obligatorio para habilitar excepcionalmente la participación.',
  })
  @MinLength(5, { message: 'El motivo debe tener al menos 5 caracteres.' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  motivo: string;

  @ApiProperty({
    description: 'Cantidad de días corridos de habilitación excepcional',
    example: 15,
    minimum: 1,
  })
  @IsInt({ message: 'La cantidad de días debe ser un número entero.' })
  @Min(1, { message: 'La cantidad de días debe ser al menos 1.' })
  @Type(() => Number)
  dias: number;
}
