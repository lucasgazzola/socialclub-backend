import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsInt, IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * US-24 — Cargar documentación obligatoria de un participante.
 * Cada documento requiere tipo, fecha de vencimiento e integrante (Persona).
 * La fecha de vencimiento es OBLIGATORIA (no se puede guardar sin ella).
 */
export class CreateDocumentacionDto {
  @ApiProperty({ example: 'Apto físico', description: 'Tipo de documento' })
  @IsString()
  @IsNotEmpty({ message: 'El tipo de documento es obligatorio.' })
  @MaxLength(80)
  tipo: string;

  @ApiProperty({ example: '2026-12-31', description: 'Fecha de vencimiento (ISO 8601)' })
  @IsNotEmpty({ message: 'La fecha de vencimiento es obligatoria.' })
  @IsDateString({}, { message: 'La fecha de vencimiento debe ser una fecha válida.' })
  fechaVencimiento: string;

  @ApiProperty({ example: 1, description: 'ID del integrante (Persona) asociado' })
  @IsInt()
  @IsNotEmpty({ message: 'Debe indicar el integrante asociado.' })
  personaId: number;
}
