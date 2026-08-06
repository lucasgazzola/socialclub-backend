import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  IsEmail,
  IsDateString,
  Matches,
} from 'class-validator';


export class CreateInscripcionDto {
  @IsString()
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  nombre: string;

  @IsString()
  @IsNotEmpty({ message: 'El apellido es obligatorio' })
  apellido: string;

  @IsString()
  @IsNotEmpty({ message: 'El DNI es obligatorio' })
  @Matches(/^\d{7,8}$/, { message: 'El DNI debe tener entre 7 y 8 dígitos numéricos' })
  dni: string;

  @IsDateString({}, { message: 'La fecha de nacimiento debe tener formato ISO (YYYY-MM-DD)' })
  fechaNacimiento: string;

  @IsEmail({}, { message: 'El email no tiene un formato válido' })
  email: string;

  @IsString()
  telefono: string;

  @IsInt({ message: 'Debe indicar la disciplina' })
  disciplinaId: number;

  @IsOptional()
  @IsInt()
  categoriaDisciplinaId?: number;
}