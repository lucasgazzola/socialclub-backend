import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { TipoEspacio } from '@prisma/client';

export class FindEspaciosQueryDto {
  @ApiPropertyOptional({ enum: TipoEspacio, description: 'Filtrar por tipo de espacio' })
  @IsOptional()
  @IsEnum(TipoEspacio, { message: 'El tipo debe ser DEPORTIVO, SOCIAL o MULTIUSO' })
  tipo?: TipoEspacio;

  @ApiPropertyOptional({ description: 'Filtrar por activo (default: true)' })
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
    description: 'Si es true, lista únicamente espacios raíz (espacioPadreId = null) con sus sub-espacios anidados',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return undefined;
  })
  @IsBoolean()
  soloRaiz?: boolean;
}
