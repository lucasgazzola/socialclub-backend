import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { MatchesPassword } from '../../auth/dto/match-password.validator';

/** DT-54 — Token recibido en el enlace del email. */
export class TokenVerificacionDto {
  @ApiProperty({ example: 'q0Z3…', description: 'Token del enlace (parámetro `token`)' })
  @IsString()
  @IsNotEmpty({ message: 'Falta el token del enlace' })
  @MaxLength(200)
  token: string;
}

/** DT-54 — Usar el enlace: verificar el email y, si hace falta, elegir la contraseña. */
export class VerificarEmailDto extends TokenVerificacionDto {
  @ApiPropertyOptional({
    example: 'Cambiar123!',
    minLength: 8,
    description:
      'Obligatoria si la cuenta todavía no tiene contraseña (alta hecha por el club). Debe contener mayúscula, minúscula, número y carácter especial.',
  })
  @IsOptional()
  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres.' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).+$/, {
    message:
      'La contraseña debe contener al menos una mayúscula, una minúscula, un número y un carácter especial.',
  })
  password?: string;

  @ApiPropertyOptional({ example: 'Cambiar123!' })
  @ValidateIf((o: VerificarEmailDto) => o.password !== undefined)
  @IsString()
  @IsNotEmpty({ message: 'Confirmá la contraseña.' })
  @MatchesPassword('password', { message: 'La confirmación de contraseña no coincide.' })
  confirmarPassword?: string;
}

export class ConsultaVerificacionRespuestaDto {
  @ApiProperty({ example: 'Ana' })
  nombre: string;

  @ApiProperty({ example: 'ana@club.local' })
  email: string;

  @ApiProperty({ description: 'true si la persona tiene que elegir su contraseña' })
  requiereContrasena: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  expiraEn: Date;
}

export class MensajeVerificacionDto {
  @ApiProperty({ example: 'Tu cuenta quedó activa. Ya podés iniciar sesión con tu contraseña.' })
  mensaje: string;
}
