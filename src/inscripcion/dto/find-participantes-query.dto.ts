import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * Estado lógico de la participación de un participante en una disciplina,
 * tal como lo entiende el usuario final (no confundir con el campo activo
 * de la tabla inscripciones, que es su representación interna).
 */
export enum EstadoInscripcionFiltro {
  INSCRIPTO = 'INSCRIPTO',
  BAJA = 'BAJA',
}

/**
 * Estado documental del participante (US-25) más el caso de un documento
 * subido por el titular que todavía no se aprobó (TASK-60).
 */
export enum EstadoDocumentalFiltro {
  PENDIENTE_APROBACION = 'PENDIENTE_APROBACION',
  PENDIENTE = 'PENDIENTE',
  BLOQUEADO = 'BLOQUEADO',
  HABILITADO = 'HABILITADO',
}

/**
 * Query params soportados por GET /inscripcion (US-08).
 * Toda la búsqueda, el filtrado y la paginación se resuelven en el backend;
 * el frontend solo debe reflejar estos parámetros en el estado de UI.
 */
export class FindParticipantesQueryDto {
  /** Búsqueda libre: matchea nombre, apellido o DNI (coincidencia exacta o parcial, sin distinguir mayúsculas). */
  @IsOptional()
  @IsString()
  busqueda?: string;

  /** Filtra por disciplina deportiva. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  disciplinaId?: number;

  /** Filtra por estado de la inscripción: INSCRIPTO (activo=true) o BAJA (activo=false). */
  @IsOptional()
  @IsEnum(EstadoInscripcionFiltro)
  estado?: EstadoInscripcionFiltro;

  /**
   * Filtra por el estado documental que muestra el listado.
   * PENDIENTE_APROBACION: hay un documento del titular esperando revisión.
   */
  @IsOptional()
  @IsEnum(EstadoDocumentalFiltro)
  estadoDocumental?: EstadoDocumentalFiltro;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pagina: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  porPagina: number = 10;

  @IsOptional()
  @IsString()
  ordenarPor?: string;

  @IsOptional()
  @IsString()
  orden?: 'asc' | 'desc' = 'asc';
}
