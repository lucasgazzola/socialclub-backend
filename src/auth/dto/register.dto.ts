import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, Matches, MaxLength, MinLength } from 'class-validator';

/**
 * US-38 — Registro público de usuario.
 *
 * A diferencia de CreateUsuarioDto (US-01, alta administrativa), este DTO NO
 * admite `roles` ni `dni`: el rol lo define el sistema (sin rol hasta que un
 * ADMIN lo asigne) para evitar escalada de privilegios en el alta pública.
 */
export class RegisterDto {
  @ApiProperty({ example: 'nuevo@socialclub.local' })
  @IsEmail({}, { message: 'Ingresá un email válido.' })
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
}
