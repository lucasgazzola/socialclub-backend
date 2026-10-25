import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PaginationQueryDto } from './pagination-query.dto';
import { FindCategoriasDisciplinaQueryDto } from '../../categorias-disciplina/dto/find-categorias-disciplina-query.dto';
import { FindMorososQueryDto } from '../../pagos/dto/find-morosos-query.dto';
import { FindMorososDeportivosQueryDto } from '../../pagos/dto/find-morosos-deportivos-query.dto';
import { GetUsuariosQueryDto } from '../../usuarios/dto/get-usuarios-query.dto';
import { FindSociosQueryDto } from '../../socios/dto/find-socios-query.dto';
import { FindParticipantesQueryDto } from '../../inscripcion/dto/find-participantes-query.dto';
import { FindAuditoriaQueryDto } from '../../auditoria/dto/find-auditoria-query.dto';

type DtoConstructor = new (...args: unknown[]) => object;

describe('DTOs de listado con paginación extendida (Max 10000 para exportación)', () => {
  const dtos: Array<{ name: string; cls: DtoConstructor }> = [
    { name: 'PaginationQueryDto', cls: PaginationQueryDto },
    { name: 'FindCategoriasDisciplinaQueryDto', cls: FindCategoriasDisciplinaQueryDto },
    { name: 'FindMorososQueryDto', cls: FindMorososQueryDto },
    { name: 'FindMorososDeportivosQueryDto', cls: FindMorososDeportivosQueryDto },
    { name: 'GetUsuariosQueryDto', cls: GetUsuariosQueryDto },
    { name: 'FindSociosQueryDto', cls: FindSociosQueryDto },
    { name: 'FindParticipantesQueryDto', cls: FindParticipantesQueryDto },
    { name: 'FindAuditoriaQueryDto', cls: FindAuditoriaQueryDto },
  ];

  for (const { name, cls } of dtos) {
    describe(name, () => {
      it('acepta porPagina = 10000 para exportar todas las filas', async () => {
        const dto = plainToInstance(cls, { porPagina: 10000 });
        const errores = await validate(dto as object);
        expect(errores.filter((e) => e.property === 'porPagina')).toHaveLength(0);
      });

      it('rechaza porPagina = 10001 que supera el límite de seguridad', async () => {
        const dto = plainToInstance(cls, { porPagina: 10001 });
        const errores = await validate(dto as object);
        expect(errores.some((e) => e.property === 'porPagina')).toBe(true);
      });

      it('rechaza porPagina menor a 1', async () => {
        const dto = plainToInstance(cls, { porPagina: 0 });
        const errores = await validate(dto as object);
        expect(errores.some((e) => e.property === 'porPagina')).toBe(true);
      });
    });
  }
});
