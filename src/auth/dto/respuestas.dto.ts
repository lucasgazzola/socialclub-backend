import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** DT-26 — Respuestas de auth en Swagger. */

export class UsuarioSesionDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'admin@socialclub.local' })
  email: string;

  @ApiProperty({ example: 'Administrador' })
  nombre: string;

  @ApiProperty({ example: 'Inicial' })
  apellido: string;

  @ApiProperty({ example: ['ADMIN'], description: 'Nombres de los roles' })
  roles: string[];
}

/** Respuesta de register, login y refresh. */
export class SesionRespuestaDto {
  @ApiProperty({ type: UsuarioSesionDto })
  usuario: UsuarioSesionDto;
}

export class CategoriaSocioDto {
  @ApiProperty({ example: 2 })
  id: number;

  @ApiProperty({ example: 'Cuota General' })
  nombre: string;

  @ApiPropertyOptional({ nullable: true, example: 'Cuota General (adultos de 18 a 60 años)' })
  descripcion: string | null;
}

export class MembresiaSesionDto {
  @ApiProperty({ example: 3 })
  id: number;

  @ApiProperty({ example: 2 })
  categoriaId: number;

  @ApiProperty({ type: CategoriaSocioDto })
  categoria: CategoriaSocioDto;

  @ApiProperty({ type: String, format: 'date-time' })
  fechaAlta: Date;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  fechaBaja: Date | null;

  @ApiProperty()
  activo: boolean;
}

export class PersonaSesionDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'Administrador' })
  nombre: string;

  @ApiProperty({ example: 'Inicial' })
  apellido: string;

  @ApiProperty({ example: '10000001' })
  dni: string;

  @ApiProperty({ nullable: true, example: 'admin@socialclub.local' })
  email: string | null;

  @ApiProperty({ nullable: true, example: null })
  telefono: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  fechaNacimiento: Date | null;

  @ApiProperty({ type: [MembresiaSesionDto] })
  membresias: MembresiaSesionDto[];
}

/** Respuesta de GET /auth/me. */
export class PerfilRespuestaDto extends UsuarioSesionDto {
  @ApiProperty({ type: PersonaSesionDto, nullable: true })
  persona: PersonaSesionDto | null;
}

/** Respuestas que solo confirman la operación. */
export class MensajeRespuestaDto {
  @ApiProperty({ example: 'Operación realizada correctamente' })
  message: string;
}
