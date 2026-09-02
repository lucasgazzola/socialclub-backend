import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

/**
 * US-31 — Validar acceso mediante lectura de QR.
 * El `token` es el contenido del código QR de la entrada (UUID v4 generado en US-30).
 */
export class ValidarAccesoDto {
  @ApiProperty({
    example: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
    description: 'Token de la entrada leído del código QR',
  })
  @IsString()
  @IsNotEmpty()
  token: string;
}
