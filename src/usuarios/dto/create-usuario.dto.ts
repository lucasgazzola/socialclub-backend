import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  IsNotEmpty,
  MaxLength,
} from 'class-validator';
import { ConfirmaEmail } from '../../common/decorators/confirma-email.decorator';

/**
 * US-01 — Alta administrativa de usuario. DT-54: no lleva contraseña; la
 * persona la elige desde el enlace que recibe por email.
 */
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
    example: 'coordinador@socialclub.local',
    description: 'DT-54: el email escrito por segunda vez, por si hay un error de tipeo.',
  })
  @IsNotEmpty({ message: 'Confirmá el email.' })
  @ConfirmaEmail('email')
  confirmarEmail: string;

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

  @ApiPropertyOptional({
    example: [1, 3],
    description:
      'DT-42: disciplinas a cargo del usuario. Solo para el rol DELEGADO; recibe las alertas de documentación de esas disciplinas.',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  disciplinasIds?: number[];
}
