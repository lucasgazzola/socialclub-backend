import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { TipoDocumentacionDisciplina } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import type { RequerimientoDocumentacionDto } from '../disciplinas/dto/create-disciplina.dto';
import {
  ETIQUETA_TIPO_DOCUMENTO,
  sincronizarRequerimientos,
} from '../disciplinas/requerimientos-doc';
import {
  describirRangoEdad,
  ETIQUETA_GENERO,
  validarRestriccionesDeCategoria,
  type Restricciones,
} from '../disciplinas/restricciones';
import { CreateCategoriaDisciplinaDto } from './dto/create-categoria-disciplina.dto';
import { UpdateCategoriaDisciplinaDto } from './dto/update-categoria-disciplina.dto';
import {
  EstadoCategoriaFiltro,
  FindCategoriasDisciplinaQueryDto,
} from './dto/find-categorias-disciplina-query.dto';

const REQUERIMIENTO_SELECT = {
  id: true,
  tipoDocumento: true,
  plazoDiasTolerancia: true,
  creadoEn: true,
} as const;

/** Campos de la categoría que se devuelven en listado y detalle. */
const CATEGORIA_INCLUDE = {
  requerimientosDoc: {
    select: REQUERIMIENTO_SELECT,
    orderBy: { tipoDocumento: 'asc' as const },
  },
  _count: { select: { inscripciones: { where: { activo: true } } } },
} as const;

/**
 * US-48 a US-51 — ABM de categorías de una disciplina (ej. Sub-15, Primera).
 * Cada categoría puede exigir documentación obligatoria ADICIONAL a la de su
 * disciplina (lo exigido a un participante es la suma de ambas) y afinar sus
 * restricciones de género y edad, siempre dentro de las de la disciplina.
 */
@Injectable()
export class CategoriasDisciplinaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  /** US-48: crea la categoría activa, con su documentación adicional. */
  async create(disciplinaId: number, dto: CreateCategoriaDisciplinaDto, responsableId: number) {
    const disciplina = await this.obtenerDisciplina(disciplinaId);
    if (!disciplina.activo) {
      throw new BadRequestException('No se pueden agregar categorías a una disciplina inactiva.');
    }
    await this.validarNombreUnico(disciplinaId, dto.nombre);
    const restricciones: Restricciones = {
      genero: dto.genero ?? null,
      edadMinima: dto.edadMinima ?? null,
      edadMaxima: dto.edadMaxima ?? null,
    };
    validarRestriccionesDeCategoria(restricciones, disciplina);
    const requerimientos = dto.requerimientosDocumentacion ?? [];
    this.validarNoRepiteDisciplina(requerimientos, disciplina.requerimientosDoc);

    const categoria = await this.prisma.$transaction(async (tx) => {
      const creada = await tx.categoriaDisciplina.create({
        data: { disciplinaId, nombre: dto.nombre, ...restricciones },
      });
      await sincronizarRequerimientos(
        tx,
        { disciplinaId, categoriaDisciplinaId: creada.id },
        requerimientos,
      );
      return creada;
    });

    await this.auditoria.registrar({
      accion: 'CREAR',
      entidad: 'CategoriaDisciplina',
      idEntidad: categoria.id,
      responsableId,
      detalle: `Categoría "${categoria.nombre}" creada en la disciplina "${disciplina.nombre}" (${this.describirRestricciones(restricciones)})${this.detalleRequerimientos(requerimientos)}`,
    });

    return this.findOne(disciplinaId, categoria.id);
  }

  /**
   * US-51: lista las categorías de la disciplina. Devuelve también los
   * requisitos de la disciplina, para mostrar la documentación total exigida
   * (disciplina + categoría).
   */
  async findAll(disciplinaId: number, query: FindCategoriasDisciplinaQueryDto = {}) {
    const disciplina = await this.obtenerDisciplina(disciplinaId);
    const busqueda = query.busqueda?.trim();
    const categorias = await this.prisma.categoriaDisciplina.findMany({
      where: {
        disciplinaId,
        ...(query.estado ? { activo: query.estado === EstadoCategoriaFiltro.ACTIVA } : {}),
        ...(busqueda ? { nombre: { contains: busqueda, mode: 'insensitive' as const } } : {}),
      },
      orderBy: { nombre: 'asc' },
      include: CATEGORIA_INCLUDE,
    });
    return { disciplina, items: categorias };
  }

  async findOne(disciplinaId: number, id: number) {
    const categoria = await this.prisma.categoriaDisciplina.findFirst({
      where: { id, disciplinaId },
      include: CATEGORIA_INCLUDE,
    });
    if (!categoria) {
      throw new NotFoundException('Categoría no encontrada');
    }
    return categoria;
  }

  /**
   * US-49: edita nombre y/o documentación adicional. Las inscripciones se
   * conservan; un requisito nuevo rige desde su `creadoEn` (fecha de la
   * modificación) para los participantes ya inscriptos.
   */
  async update(
    disciplinaId: number,
    id: number,
    dto: UpdateCategoriaDisciplinaDto,
    responsableId: number,
  ) {
    const disciplina = await this.obtenerDisciplina(disciplinaId);
    const actual = await this.findOne(disciplinaId, id);
    if (dto.nombre !== undefined) {
      await this.validarNombreUnico(disciplinaId, dto.nombre, id);
    }
    if (dto.requerimientosDocumentacion !== undefined) {
      this.validarNoRepiteDisciplina(dto.requerimientosDocumentacion, disciplina.requerimientosDoc);
    }
    const cambiaRestricciones =
      dto.genero !== undefined || dto.edadMinima !== undefined || dto.edadMaxima !== undefined;
    const restricciones: Restricciones = {
      genero: dto.genero === undefined ? actual.genero : dto.genero,
      edadMinima: dto.edadMinima === undefined ? actual.edadMinima : dto.edadMinima,
      edadMaxima: dto.edadMaxima === undefined ? actual.edadMaxima : dto.edadMaxima,
    };
    if (cambiaRestricciones) {
      validarRestriccionesDeCategoria(restricciones, disciplina);
    }

    await this.prisma.$transaction(async (tx) => {
      if (dto.nombre !== undefined || cambiaRestricciones) {
        await tx.categoriaDisciplina.update({
          where: { id },
          data: {
            ...(dto.nombre !== undefined ? { nombre: dto.nombre } : {}),
            ...(cambiaRestricciones ? restricciones : {}),
          },
        });
      }
      if (dto.requerimientosDocumentacion !== undefined) {
        await sincronizarRequerimientos(
          tx,
          { disciplinaId, categoriaDisciplinaId: id },
          dto.requerimientosDocumentacion,
        );
      }
    });

    const cambios = [
      dto.nombre !== undefined && dto.nombre !== actual.nombre
        ? `nombre "${actual.nombre}" → "${dto.nombre}"`
        : null,
      cambiaRestricciones ? `restricciones: ${this.describirRestricciones(restricciones)}` : null,
      dto.requerimientosDocumentacion !== undefined
        ? `documentación adicional: ${
            dto.requerimientosDocumentacion
              .map((r) => ETIQUETA_TIPO_DOCUMENTO[r.tipoDocumento])
              .join(', ') || 'ninguna'
          }`
        : null,
    ].filter(Boolean);
    await this.auditoria.registrar({
      accion: 'EDITAR',
      entidad: 'CategoriaDisciplina',
      idEntidad: id,
      responsableId,
      detalle: `Categoría "${actual.nombre}" (${disciplina.nombre}) editada${cambios.length ? `: ${cambios.join('; ')}` : ''}`,
    });

    return this.findOne(disciplinaId, id);
  }

  /** US-50: baja lógica. Conserva las inscripciones históricas. */
  async deactivate(disciplinaId: number, id: number, responsableId: number) {
    const categoria = await this.findOne(disciplinaId, id);
    if (!categoria.activo) {
      throw new ConflictException('La categoría ya se encuentra inactiva');
    }
    await this.prisma.categoriaDisciplina.update({ where: { id }, data: { activo: false } });
    await this.auditoria.registrar({
      accion: 'BAJA',
      entidad: 'CategoriaDisciplina',
      idEntidad: id,
      responsableId,
      detalle: `Categoría "${categoria.nombre}" desactivada`,
    });
    return this.findOne(disciplinaId, id);
  }

  async reactivate(disciplinaId: number, id: number, responsableId: number) {
    const categoria = await this.findOne(disciplinaId, id);
    if (categoria.activo) {
      throw new ConflictException('La categoría ya se encuentra activa');
    }
    await this.prisma.categoriaDisciplina.update({ where: { id }, data: { activo: true } });
    await this.auditoria.registrar({
      accion: 'REACTIVAR',
      entidad: 'CategoriaDisciplina',
      idEntidad: id,
      responsableId,
      detalle: `Categoría "${categoria.nombre}" reactivada`,
    });
    return this.findOne(disciplinaId, id);
  }

  private async obtenerDisciplina(disciplinaId: number) {
    const disciplina = await this.prisma.disciplina.findUnique({
      where: { id: disciplinaId },
      select: {
        id: true,
        nombre: true,
        activo: true,
        solicitaDocumentacion: true,
        genero: true,
        edadMinima: true,
        edadMaxima: true,
        requerimientosDoc: {
          where: { categoriaDisciplinaId: null },
          select: REQUERIMIENTO_SELECT,
          orderBy: { tipoDocumento: 'asc' },
        },
      },
    });
    if (!disciplina) {
      throw new NotFoundException('Disciplina no encontrada');
    }
    return disciplina;
  }

  private async validarNombreUnico(disciplinaId: number, nombre: string, excluirId?: number) {
    const existente = await this.prisma.categoriaDisciplina.findFirst({
      where: {
        disciplinaId,
        nombre: { equals: nombre, mode: 'insensitive' },
        ...(excluirId ? { id: { not: excluirId } } : {}),
      },
    });
    if (existente) {
      throw new ConflictException('Ya existe una categoría con ese nombre en la disciplina');
    }
  }

  /** La categoría solo suma requisitos: no puede repetir los que ya exige la disciplina. */
  private validarNoRepiteDisciplina(
    requerimientos: RequerimientoDocumentacionDto[],
    deDisciplina: { tipoDocumento: TipoDocumentacionDisciplina }[],
  ) {
    const tiposDisciplina = new Set(deDisciplina.map((r) => r.tipoDocumento));
    const repetidos = requerimientos.filter((r) => tiposDisciplina.has(r.tipoDocumento));
    if (repetidos.length) {
      throw new BadRequestException(
        `La disciplina ya exige: ${repetidos.map((r) => ETIQUETA_TIPO_DOCUMENTO[r.tipoDocumento]).join(', ')}.`,
      );
    }
  }

  private describirRestricciones(restricciones: Restricciones) {
    const genero = restricciones.genero
      ? ETIQUETA_GENERO[restricciones.genero]
      : 'cualquier género';
    return `${genero}, ${describirRangoEdad(restricciones)}`;
  }

  private detalleRequerimientos(requerimientos: RequerimientoDocumentacionDto[]) {
    return requerimientos.length
      ? `, con documentación adicional: ${requerimientos.map((r) => ETIQUETA_TIPO_DOCUMENTO[r.tipoDocumento]).join(', ')}`
      : '';
  }
}
