import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, Length, Matches } from 'class-validator';

/**
 * US-09: Alta como socio: Nombre, apellido y email se
 * precompletan desde el Usuario logueado en el backend.
 */
export class RegistrarSocioDto {
  @ApiProperty({ example: '40123456', description: 'DNI del usuario (se valida contra Persona)' })
  @IsString()
  @Length(6, 20)
  @Matches(/^\d+$/, { message: 'El DNI solo puede contener números' })
  dni: string;

  @ApiProperty({ example: 1, description: 'ID de CategoriaSocio a asignar' })
  @IsInt()
  categoriaId: number;
}
