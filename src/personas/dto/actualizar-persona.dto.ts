import { IsEmail, IsDateString, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

/**
 * US-06: edición de los datos básicos de un participante. Todos los campos
 * son opcionales: se actualiza solo lo que viene. Es el endpoint que usa la
 * página de edición cuando el participante no tiene inscripciones vigentes
 * (US-07: un dado de baja sigue siendo participante y se debe poder editar).
 */
export class ActualizarPersonaDto {
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
}
