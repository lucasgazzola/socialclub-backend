import { ApiProperty } from '@nestjs/swagger';

/** DT-26 — Respuestas de usuarios en Swagger (nunca incluyen el hash de la contraseña). */

class RolDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'ADMIN' })
  nombre: string;
}

class RolAsignadoDto {
  @ApiProperty({ type: RolDto })
  rol: RolDto;
}

class DisciplinaACargoDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'Fútbol Mayor' })
  nombre: string;
}

export class UsuarioRespuestaDto {
  @ApiProperty({ example: 5 })
  id: number;

  @ApiProperty({ example: 'coordinador@socialclub.local' })
  email: string;

  @ApiProperty({ example: 'Ana' })
  nombre: string;

  @ApiProperty({ example: 'Pérez' })
  apellido: string;

  @ApiProperty()
  activo: boolean;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  ultimoLogin: Date | null;

  @ApiProperty({ type: String, format: 'date-time' })
  creadoEn: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  actualizadoEn: Date;

  @ApiProperty({ example: 12 })
  personaId: number;

  @ApiProperty({ nullable: true, example: '30111222' })
  dni: string | null;

  @ApiProperty({ type: [RolAsignadoDto] })
  roles: RolAsignadoDto[];

  @ApiProperty({
    type: [DisciplinaACargoDto],
    description: 'DT-42: disciplinas a cargo (vacío si no es delegado)',
  })
  disciplinas: DisciplinaACargoDto[];
}

class TotalesPorEstadoDto {
  @ApiProperty({ example: 6 })
  todos: number;

  @ApiProperty({ example: 5 })
  activos: number;

  @ApiProperty({ example: 1 })
  inactivos: number;
}

export class UsuariosPaginadosDto {
  @ApiProperty({ type: [UsuarioRespuestaDto] })
  items: UsuarioRespuestaDto[];

  @ApiProperty({ example: 6, description: 'Total con los filtros aplicados' })
  total: number;

  @ApiProperty({ example: 1 })
  pagina: number;

  @ApiProperty({ example: 10 })
  porPagina: number;

  @ApiProperty({ type: TotalesPorEstadoDto, description: 'Totales por estado, para las pestañas' })
  counts: TotalesPorEstadoDto;
}
