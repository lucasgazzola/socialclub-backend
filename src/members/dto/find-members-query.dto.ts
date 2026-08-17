import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';

/**
 * Estado lógico del socio, tal como lo entiende el usuario final
 * (no confundir con el campo `activo` de la base, que es su representación interna).
 */
export enum MemberStatusFilter {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

/**
 * Query params soportados por GET /socios (US-15).
 * Toda la búsqueda, el filtrado y la paginación se resuelven en el backend;
 * el frontend solo debe reflejar estos parámetros en la URL/estado de UI.
 */
export class FindMembersQueryDto {
  /** Búsqueda libre: matchea nombre, apellido o DNI (parcial, insensible a mayúsculas). */
  @IsOptional()
  @IsString()
  search?: string;

  /** Filtra por categoría de socio (activo, vitalicio, etc.). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  categoryId?: number;

  /** Filtra por estado del socio: ALTA (activo=true) o BAJA (activo=false). */
  @IsOptional()
  @IsEnum(MemberStatusFilter)
  status?: MemberStatusFilter;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  perPage: number = 10;
}
