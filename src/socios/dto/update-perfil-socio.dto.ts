import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdatePerfilSocioDto {
  @ApiProperty({ example: 'Juan', description: 'Nombre del socio' })
  @IsString({ message: 'El nombre debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El nombre no puede estar vacío' })
  @MaxLength(30, { message: 'El nombre no puede superar los 30 caracteres' })
  nombre: string;

  @ApiProperty({ example: 'Perez', description: 'Apellido del socio' })
  @IsString({ message: 'El apellido debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El apellido no puede estar vacío' })
  @MaxLength(30, { message: 'El apellido no puede superar los 30 caracteres' })
  apellido: string;

  @ApiProperty({ example: 'socio@correo.com', description: 'Correo electrónico único' })
  @Transform(({ value }: { value?: string }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'El formato de email no es válido (ejemplo: usuario@dominio.com)' })
  @IsNotEmpty({ message: 'El email no puede estar vacío' })
  email: string;

  @ApiPropertyOptional({ example: '+54 353 1234567', description: 'Teléfono de contacto' })
  @IsOptional()
  @IsString({ message: 'El teléfono debe ser una cadena de texto' })
  @MaxLength(30, { message: 'El teléfono no puede superar los 30 caracteres' })
  telefono?: string;
}
