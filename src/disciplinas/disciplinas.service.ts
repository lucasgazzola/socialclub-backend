import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { CreateDisciplinaDto } from './dto/create-disciplina.dto';
import { UpdateDisciplinaDto } from './dto/update-disciplina.dto';
import { EstadoDisciplinaFiltro, FindDisciplinasQueryDto } from './dto/find-disciplinas-query.dto';

/** Campos de Disciplina que se incluyen siempre en las respuestas de listado y detalle. */
const DISCIPLINA_INCLUDE = {
  categorias: {
    orderBy: { nombre: 'asc' as const },
    select: { id: true, nombre: true, activo: true },
  },
  requerimientosDoc: {
    select: { id: true, tipoDocumento: true, plazoDiasTolerancia: true },
    orderBy: { tipoDocumento: 'asc' as const },
  },
  _count: {
    select: { configuracionesCuotaDeportiva: true },
  },
} as const;

@Injectable()
export class DisciplinasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async create(dto: CreateDisciplinaDto, responsableId: number) {
    this.validarRangoEdad(dto.edadMinima, dto.edadMaxima);
    const existente = await this.prisma.disciplina.findUnique({
      where: { nombre: dto.nombre },
    });
    if (existente) {
      throw new ConflictException('Ya existe una disciplina con ese nombre');
    }

    const { requerimientosDocumentacion, ...dataDisciplina } = dto;

    const disciplina = await this.prisma.$transaction(async (tx) => {
      const disc = await tx.disciplina.create({ data: dataDisciplina });

      if (dataDisciplina.solicitaDocumentacion && requerimientosDocumentacion?.length) {
        await tx.disciplinaRequerimientoDoc.createMany({
          data: requerimientosDocumentacion.map((requerimiento) => ({
            disciplinaId: disc.id,
            tipoDocumento: requerimiento.tipoDocumento,
            plazoDiasTolerancia: requerimiento.plazoDiasTolerancia ?? 0,
          })),
        });
      }

      return disc;
    });

    await this.auditoria.registrar({
      accion: 'CREAR',
      entidad: 'Disciplina',
      idEntidad: disciplina.id,
      responsableId,
      detalle: `Disciplina "${disciplina.nombre}" creada`,
    });

    return this.findOne(disciplina.id);
  }

  async findAll(query: FindDisciplinasQueryDto = new FindDisciplinasQueryDto()) {
    const { busqueda, estado, pagina = 1, porPagina = 20 } = query;
    const activo = estado === EstadoDisciplinaFiltro.ACTIVA
      ? true
      : estado === EstadoDisciplinaFiltro.INACTIVA
        ? false
        : undefined;
    const where = {
      ...(activo === undefined ? {} : { activo }),
      ...(busqueda?.trim()
        ? {
            OR: [
              { nombre: { contains: busqueda.trim(), mode: 'insensitive' as const } },
              { descripcion: { contains: busqueda.trim(), mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const whereBusqueda = busqueda?.trim()
      ? {
          OR: [
            { nombre: { contains: busqueda.trim(), mode: 'insensitive' as const } },
            { descripcion: { contains: busqueda.trim(), mode: 'insensitive' as const } },
          ],
        }
      : {};
    const [items, total, todas, activas, inactivas] = await this.prisma.$transaction([
      this.prisma.disciplina.findMany({
        where,
        orderBy: { nombre: 'asc' },
        skip: (pagina - 1) * porPagina,
        take: porPagina,
        include: DISCIPLINA_INCLUDE,
      }),
      this.prisma.disciplina.count({ where }),
      this.prisma.disciplina.count({ where: whereBusqueda }),
      this.prisma.disciplina.count({ where: { ...whereBusqueda, activo: true } }),
      this.prisma.disciplina.count({ where: { ...whereBusqueda, activo: false } }),
    ]);
    return {
      items,
      total,
      pagina,
      porPagina,
      conteos: { todas, activas, inactivas },
    };
  }

  async findOne(id: number) {
    const disciplina = await this.prisma.disciplina.findUnique({
      where: { id },
      include: {
        ...DISCIPLINA_INCLUDE,
        configuracionesCuotaDeportiva: {
          include: { categoria: true },
          orderBy: { periodoAplicacion: 'desc' },
        },
      },
    });
    if (!disciplina) {
      throw new NotFoundException('Disciplina no encontrada');
    }
    return disciplina;
  }

  async update(id: number, dto: UpdateDisciplinaDto, responsableId: number) {
    const actual = await this.findOne(id);
    this.validarRangoEdad(
      dto.edadMinima === undefined ? (actual.edadMinima ?? undefined) : dto.edadMinima,
      dto.edadMaxima === undefined ? (actual.edadMaxima ?? undefined) : dto.edadMaxima,
    );

    if (dto.nombre) {
      const existente = await this.prisma.disciplina.findUnique({
        where: { nombre: dto.nombre },
      });
      if (existente && existente.id !== id) {
        throw new ConflictException('Ya existe una disciplina con ese nombre');
      }
    }

    const { requerimientosDocumentacion, ...dataDisciplina } = dto;

    await this.prisma.$transaction(async (tx) => {
      await tx.disciplina.update({ where: { id }, data: dataDisciplina });

      // Si se enviaron requisitos, o se desactivó la documentación,
      // reemplazar los requisitos para no conservar datos obsoletos.
      if (requerimientosDocumentacion !== undefined || dataDisciplina.solicitaDocumentacion === false) {
        await tx.disciplinaRequerimientoDoc.deleteMany({ where: { disciplinaId: id } });
        const solicitaDocumentacion = dataDisciplina.solicitaDocumentacion ?? actual.solicitaDocumentacion;
        if (solicitaDocumentacion && requerimientosDocumentacion?.length) {
          await tx.disciplinaRequerimientoDoc.createMany({
            data: requerimientosDocumentacion.map((requerimiento) => ({
              disciplinaId: id,
              tipoDocumento: requerimiento.tipoDocumento,
              plazoDiasTolerancia: requerimiento.plazoDiasTolerancia ?? 0,
            })),
          });
        }
      }
    });

    await this.auditoria.registrar({
      accion: 'EDITAR',
      entidad: 'Disciplina',
      idEntidad: id,
      responsableId,
      detalle: dto.nombre ? `Nombre actualizado a "${dto.nombre}"` : undefined,
    });

    return this.findOne(id);
  }

  async deactivate(id: number, responsableId: number) {
    const disciplina = await this.findOne(id);

    if (!disciplina.activo) {
      throw new ConflictException('La disciplina ya se encuentra inactiva');
    }

    const actualizada = await this.prisma.disciplina.update({
      where: { id },
      data: { activo: false },
    });

    await this.auditoria.registrar({
      accion: 'BAJA',
      entidad: 'Disciplina',
      idEntidad: id,
      responsableId,
      detalle: `Disciplina "${disciplina.nombre}" desactivada`,
    });

    return actualizada;
  }

  async reactivate(id: number, responsableId: number) {
    const disciplina = await this.findOne(id);

    if (disciplina.activo) {
      throw new ConflictException('La disciplina ya se encuentra activa');
    }

    const actualizada = await this.prisma.disciplina.update({
      where: { id },
      data: { activo: true },
    });

    await this.auditoria.registrar({
      accion: 'REACTIVAR',
      entidad: 'Disciplina',
      idEntidad: id,
      responsableId,
      detalle: `Disciplina "${disciplina.nombre}" reactivada`,
    });

    return actualizada;
  }

  private validarRangoEdad(edadMinima?: number, edadMaxima?: number) {
    if (
      edadMinima !== undefined &&
      edadMinima !== null &&
      edadMaxima !== undefined &&
      edadMaxima !== null &&
      edadMinima >= edadMaxima
    ) {
      throw new BadRequestException('La edad máxima debe ser mayor que la edad mínima');
    }
  }
}
