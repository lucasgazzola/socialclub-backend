import { PartialType } from '@nestjs/swagger';
import { CreateUsuarioDto } from './create-usuario.dto';

/**
 * US-02: todos los campos del alta son opcionales en la edición.
 * PartialType reutiliza las validaciones de CreateUsuarioDto.
 */
export class UpdateUsuarioDto extends PartialType(CreateUsuarioDto) {}
