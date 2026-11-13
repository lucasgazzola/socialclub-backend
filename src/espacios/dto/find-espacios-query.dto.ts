import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ModalidadReserva, TipoEspacio } from '@prisma/client';

export class FindEspaciosQueryDto {
  @ApiPropertyOptional({ enum: TipoEspacio, description: 'Filtrar por tipo de espacio' })
  @IsOptional()
  @IsEnum(TipoEspacio, { message: 'El tipo debe ser DEPORTIVO, SOCIAL o MULTIUSO' })
  tipo?: TipoEspacio;

  @ApiPropertyOptional({ enum: ModalidadReserva, description: 'Filtrar por modalidad de alquiler' })
  @IsOptional()
  @IsEnum(ModalidadReserva, { message: 'La modalidad debe ser POR_HORA o DIA_COMPLETO' })
  modalidad?: ModalidadReserva;

  @ApiPropertyOptional({
    enum: ['todos', 'activos', 'inactivos'],
    description: 'Filtro de pestaña de estado (todos | activos | inactivos)',
  })
  @IsOptional()
  @IsIn(['todos', 'activos', 'inactivos'], {
    message: 'El estado debe ser todos, activos o inactivos',
  })
  estado?: 'todos' | 'activos' | 'inactivos';

  @ApiPropertyOptional({ description: 'Filtrar por activo booleano (default: true en catálogo simple)' })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return undefined;
  })
  @IsBoolean()
  activo?: boolean;

  @ApiPropertyOptional({ description: 'Buscar por nombre o ubicación' })
  @IsOptional()
  @IsString()
  busqueda?: string;

  @ApiPropertyOptional({
    description: 'Filtrar sub-espacios de un espacio padre específico (Patrón Composite)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  espacioPadreId?: number;

  @ApiPropertyOptional({
    description:
      'Si es true, lista únicamente espacios raíz (espacioPadreId = null) con sus sub-espacios anidados',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return undefined;
  })
  @IsBoolean()
  soloRaiz?: boolean;

  @ApiPropertyOptional({ description: 'Página actual (1..N)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pagina?: number;

  @ApiPropertyOptional({ description: 'Cantidad de registros por página (1..100)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  porPagina?: number;

  @ApiPropertyOptional({
    description: 'Campo por el cual ordenar (nombre | tipo | capacidadMaxima | precio | montoSena)',
  })
  @IsOptional()
  @IsString()
  ordenarPor?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], description: 'Sentido del ordenamiento' })
  @IsOptional()
  @IsIn(['asc', 'desc'], { message: 'El orden debe ser asc o desc' })
  orden?: 'asc' | 'desc';
}
