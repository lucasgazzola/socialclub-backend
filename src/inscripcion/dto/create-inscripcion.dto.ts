import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  IsEmail,
  IsDateString,
  Matches,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Alta de inscripción. Se usa en dos modos:
 *  - Participante ya registrado: se envía solo `personaId` + disciplina/categoría.
 *  - Participante nuevo: se envían sus datos básicos (nombre, apellido, dni, etc.).
 * Por eso los datos de persona son opcionales: se requieren solo cuando no viene personaId.
 */
export class CreateInscripcionDto {
  @IsOptional()
  @IsInt()
  personaId?: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  nombre?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'El apellido es obligatorio' })
  apellido?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'El DNI es obligatorio' })
  @Matches(/^\d{7,8}$/, { message: 'El DNI debe tener entre 7 y 8 dígitos numéricos' })
  dni?: string;

  @IsOptional()
  @IsDateString({}, { message: 'La fecha de nacimiento debe tener formato ISO (YYYY-MM-DD)' })
  fechaNacimiento?: string;

  @IsOptional()
  @IsEmail({}, { message: 'El email no tiene un formato válido' })
  email?: string;

  @IsOptional()
  @IsString()
  telefono?: string;

  @IsInt({ message: 'Debe indicar la disciplina' })
  disciplinaId: number;

  @IsOptional()
  @IsInt()
  categoriaDisciplinaId?: number;
}
