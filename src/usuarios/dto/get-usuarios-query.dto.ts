import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export enum CriterioOrdenUsuarios {
  NOMBRE = 'nombre',
  DNI = 'dni',
  EMAIL = 'email',
  ROLES = 'roles',
  ESTADO = 'estado',
  FECHA = 'fecha',
}

export enum SentidoOrden {
  ASC = 'asc',
  DESC = 'desc',
}

export class GetUsuariosQueryDto {
  @ApiPropertyOptional({ description: 'Término de búsqueda por nombre o apellido' })
  @IsOptional()
  @IsString()
  busqueda?: string;

  @ApiPropertyOptional({ description: 'Filtro por ID de rol' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  rolId?: number;

  @ApiPropertyOptional({
    description: 'Filtro por estado de la cuenta',
    enum: ['todos', 'activos', 'inactivos'],
    default: 'todos',
  })
  @IsOptional()
  @IsString()
  estado?: 'todos' | 'activos' | 'inactivos';

  @ApiPropertyOptional({
    description: 'Campo de ordenamiento: nombre, dni, email, roles, estado, fecha',
    enum: CriterioOrdenUsuarios,
  })
  @IsOptional()
  @IsString()
  ordenarPor?: string;

  @ApiPropertyOptional({
    description: 'Sentido del ordenamiento: asc o desc',
    enum: SentidoOrden,
    default: SentidoOrden.ASC,
  })
  @IsOptional()
  @IsString()
  orden?: 'asc' | 'desc' = 'asc';

  @ApiPropertyOptional({ description: 'Número de página', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pagina: number = 1;

  @ApiPropertyOptional({ description: 'Cantidad de elementos por página', default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  porPagina: number = 10;
}
