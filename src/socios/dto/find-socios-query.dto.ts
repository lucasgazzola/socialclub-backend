import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * Estado lógico del socio, tal como lo entiende el usuario final
 * (no confundir con el campo `activo` de la base, que es su representación interna).
 */
export enum EstadoSocioFiltro {
  ALTA = 'ALTA',
  BAJA = 'BAJA',
}

/** Estado de la cuota social, con la misma regla de vencimiento que US-19. */
export enum EstadoCuentaSocioFiltro {
  MOROSO = 'MOROSO',
  AL_DIA = 'AL_DIA',
}

/**
 * Query params soportados por GET /socios (US-15).
 * Toda la búsqueda, el filtrado y la paginación se resuelven en el backend;
 * el frontend solo debe reflejar estos parámetros en la URL/estado de UI.
 */

export enum CriterioOrdenSocios {
  NOMBRE = 'nombre',
  DNI = 'dni',
  EMAIL = 'email',
  CATEGORIA = 'categoria',
  ESTADO = 'estado',
  CUENTA = 'cuenta',
  FECHA = 'fecha',
}

export enum SentidoOrden {
  ASC = 'asc',
  DESC = 'desc',
}

export class FindSociosQueryDto {
  /** Búsqueda libre: matchea nombre, apellido o DNI (parcial, insensible a mayúsculas). */
  @IsOptional()
  @IsString()
  busqueda?: string;

  /** Filtra por categoría de socio (activo, vitalicio, etc.). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  categoriaId?: number;

  /** Filtra por estado del socio: ALTA (activo=true) o BAJA (activo=false). */
  @IsOptional()
  @IsEnum(EstadoSocioFiltro)
  estado?: EstadoSocioFiltro;

  /** Filtra por la cuota social: MOROSO (hay períodos vencidos impagos) o AL_DIA. */
  @IsOptional()
  @IsEnum(EstadoCuentaSocioFiltro)
  estadoCuenta?: EstadoCuentaSocioFiltro;

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
