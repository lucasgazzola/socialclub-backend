import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsEmail,
  IsString,
  MinLength,
  Length,
  Matches,
  IsNotEmpty,
  MaxLength,
} from 'class-validator';

export class CreateUsuarioDto {
  @ApiProperty({ example: '123456789', description: 'DNI sin puntos o guiones' })
  @IsString()
  @Length(7, 8)
  @Matches(/^\d+$/, { message: 'El DNI debe contener únicamente números' })
  @IsNotEmpty()
  dni: string;

  @ApiProperty({ example: 'coordinador@socialclub.local' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({
    example: 'Cambiar123!',
    minLength: 8,
    description:
      'Debe contener al menos una mayúscula, una minúscula, un número y un carácter especial.',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).+$/, {
    message:
      'La contraseña debe contener al menos una mayúscula, una minúscula, un número y un carácter especial.',
  })
  password: string;

  @ApiProperty({ example: 'Ana' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  @Matches(/^[A-Za-zÁÉÍÓÚáéíóúÑñ\s'-]+$/, { message: 'El nombre contiene caracteres inválidos' })
  nombre: string;

  @ApiProperty({ example: 'Pérez' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  @Matches(/^[A-Za-zÁÉÍÓÚáéíóúÑñ\s'-]+$/, { message: 'El apellido contiene caracteres inválidos' })
  apellido: string;

  @ApiProperty({ example: ['ADMIN'], description: 'Nombres de los roles a asignar' })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  roles: string[];
}
