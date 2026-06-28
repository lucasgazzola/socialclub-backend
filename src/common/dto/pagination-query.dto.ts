import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * Parámetros de paginación reutilizables por cualquier endpoint de listado.
 * Centralizarlos evita repetir validación de `pagina` / `porPagina`.
 */
export class PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Texto de búsqueda libre', example: 'gazzola' })
  @IsOptional()
  @IsString()
  busqueda?: string;

  @ApiPropertyOptional({ description: 'Número de página (desde 1)', default: 1, example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pagina = 1;

  @ApiPropertyOptional({
    description: 'Cantidad de elementos por página',
    default: 20,
    example: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  porPagina = 20;
}
