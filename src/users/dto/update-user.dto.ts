import { PartialType } from '@nestjs/swagger';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { CreateUserDto } from './create-user.dto';

/**
 * US-02: todos los campos del alta son opcionales en la edición.
 * PartialType reutiliza las validaciones de CreateUserDto.
 */
export class UpdateUserDto extends PartialType(CreateUserDto) {}

export class UpdateUserPasswordDto extends UpdateUserDto {
  @ApiPropertyOptional({ example: 'Admin123!', description: 'Contraseña actual del usuario' })
  @IsOptional()
  @IsString()
  currentPassword?: string;
}
