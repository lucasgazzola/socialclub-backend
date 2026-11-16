import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CuotaSocialService } from '../cuota-social/cuota-social.service';
import { filtroEventoTerminado } from '../eventos/fin-del-evento';

/**
 * TASK-60 — Información pública del club para la landing: planes de socio con
 * su cuota vigente, disciplinas activas y números reales del padrón. Solo
 * lectura y sin datos personales: lo puede pedir cualquier visitante.
 */
@Injectable()
export class ClubService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cuotaSocial: CuotaSocialService,
  ) {}

  async informacionPublica(ahora: Date = new Date()) {
    const [categorias, vigentes, disciplinas, socios, participantes, eventosProximos] =
      await Promise.all([
        this.prisma.categoriaSocio.findMany({ orderBy: { id: 'asc' } }),
        this.cuotaSocial.getVigentes(),
        this.prisma.disciplina.findMany({
          where: { activo: true },
          orderBy: { nombre: 'asc' },
          select: {
            id: true,
            nombre: true,
            descripcion: true,
            genero: true,
            edadMinima: true,
            edadMaxima: true,
            categorias: {
              where: { activo: true },
              orderBy: { nombre: 'asc' },
              select: { nombre: true },
            },
          },
        }),
        this.prisma.persona.count({ where: { membresias: { some: { activo: true } } } }),
        this.prisma.persona.count({
          where: { inscripciones: { some: { activo: true, disciplina: { activo: true } } } },
        }),
        this.prisma.evento.count({
          where: { estado: 'PUBLICADO', NOT: filtroEventoTerminado(ahora) },
        }),
      ]);

    const cuotaPorCategoria = new Map(vigentes.map((v) => [v.categoriaId, v.monto]));

    return {
      planes: categorias.map((categoria) => ({
        categoriaId: categoria.id,
        nombre: categoria.nombre,
        descripcion: categoria.descripcion,
        cuotaMensual: cuotaPorCategoria.get(categoria.id) ?? null,
      })),
      disciplinas: disciplinas.map(({ categorias: cats, ...disciplina }) => ({
        ...disciplina,
        categorias: cats.map((c) => c.nombre),
      })),
      numeros: {
        socios,
        participantes,
        disciplinas: disciplinas.length,
        eventosProximos,
      },
    };
  }
}
