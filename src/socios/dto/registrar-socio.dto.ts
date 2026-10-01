import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Length, Matches } from 'class-validator';

/**
 * US-09: Alta como socio: Nombre, apellido y email se
 * precompletan desde el Usuario logueado en el backend.
 * El DNI es obligatorio solo si la Persona vinculada aún no lo tiene registrado.
 */
export class RegistrarSocioDto {
  @ApiPropertyOptional({
    example: '40123456',
    description: 'DNI del usuario (se valida contra Persona si no está ya registrado)',
  })
  @IsOptional()
  @IsString()
  @Length(6, 20)
  @Matches(/^\d+$/, { message: 'El DNI solo puede contener números' })
  dni?: string;

  @ApiProperty({ example: 1, description: 'ID de CategoriaSocio a asignar' })
  @IsInt()
  categoriaId: number;
}
