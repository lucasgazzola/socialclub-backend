import { PartialType } from '@nestjs/swagger';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { CreateUsuarioDto } from './create-usuario.dto';

/**
 * US-02: todos los campos del alta son opcionales en la edición.
 * PartialType reutiliza las validaciones de CreateUsuarioDto.
 */
export class UpdateUsuarioDto extends PartialType(CreateUsuarioDto) {}

export class UpdateUsuarioPasswordDto extends UpdateUsuarioDto {
  @ApiPropertyOptional({ example: 'Admin123!', description: 'Contraseña actual del usuario' })
  @IsOptional()
  @IsString()
  currentPassword?: string;
}
