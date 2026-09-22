import { IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export enum EstadoDisciplinaFiltro {
  ACTIVA = 'ACTIVA',
  INACTIVA = 'INACTIVA',
}

export class FindDisciplinasQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(EstadoDisciplinaFiltro)
  estado?: EstadoDisciplinaFiltro;
}
