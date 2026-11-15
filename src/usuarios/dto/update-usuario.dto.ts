import { PartialType } from '@nestjs/swagger';
import { CreateUsuarioDto } from './create-usuario.dto';

/**
 * US-02: todos los campos del alta son opcionales en la edición.
 * PartialType reutiliza las validaciones de CreateUsuarioDto.
 * DT-54: el administrador ya no maneja contraseñas; cada persona elige la suya
 * desde el enlace del email y la cambia con `PATCH /auth/cambiar-contrasena`.
 */
export class UpdateUsuarioDto extends PartialType(CreateUsuarioDto) {}
