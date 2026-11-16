import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches, MinLength } from 'class-validator';
import { MatchesPassword } from './match-password.validator';

/**
 * US-41 — Cambio de contraseña del usuario autenticado.
 *
 * A diferencia de UpdateUsuarioPasswordDto (US-02, donde un ADMIN edita a otro
 * usuario), acá el usuario cambia SU propia contraseña: no admite `roles` ni
 * campos de perfil, solo las tres contraseñas del formulario.
 *
 * La política de complejidad es la misma de US-38/US-01 (mínimo 8, mayúscula,
 * minúscula, número y carácter especial) para que una contraseña nueva nunca
 * pueda quedar más débil que la exigida en el alta.
 */
export class CambiarContrasenaDto {
  @ApiProperty({
    example: 'Admin123!',
    description: 'Contraseña actual. Debe coincidir con la guardada para permitir el cambio.',
  })
  @IsString()
  @IsNotEmpty({ message: 'La contraseña actual es obligatoria.' })
  passwordActual: string;

  @ApiProperty({
    example: 'Nueva123!',
    minLength: 8,
    description:
      'Debe contener al menos una mayúscula, una minúscula, un número y un carácter especial.',
  })
  @IsString()
  @IsNotEmpty({ message: 'La nueva contraseña es obligatoria.' })
  @MinLength(8)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).+$/, {
    message:
      'La contraseña debe contener al menos una mayúscula, una minúscula, un número y un carácter especial.',
  })
  nuevaContrasena: string;

  @ApiProperty({
    example: 'Nueva123!',
    description: 'Repetición de la nueva contraseña. Debe coincidir con `nuevaContrasena`.',
  })
  @IsString()
  @IsNotEmpty({ message: 'Debes confirmar la nueva contraseña.' })
  @MatchesPassword('nuevaContrasena', {
    message: 'La confirmación no coincide con la nueva contraseña.',
  })
  confirmarNuevaContrasena: string;
}
