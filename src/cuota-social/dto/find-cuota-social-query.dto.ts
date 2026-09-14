import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Matches } from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class FindCuotaSocialQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filtrar por categoría de socio', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  categoriaId?: number;

  @ApiPropertyOptional({
    description: 'Filtrar por período de aplicación (YYYY-MM)',
    example: '2026-10',
  })
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: 'periodoAplicacion debe tener el formato YYYY-MM (ej: 2026-10)',
  })
  periodoAplicacion?: string;
}
