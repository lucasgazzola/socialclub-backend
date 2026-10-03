import { Injectable, NotFoundException } from '@nestjs/common';
import type { TipoDocumentacionDisciplina } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ETIQUETA_TIPO_DOCUMENTO } from '../disciplinas/requerimientos-doc';
import {
  documentoVigentePorTipo,
  estadoDeInscripcion,
  estadoGeneral,
  type DocumentoPresentado,
  type EstadoDeInscripcion,
  type RequisitoExigido,
} from './estado-documental';

const REQUISITO_SELECT = {
  disciplinaId: true,
  categoriaDisciplinaId: true,
  tipoDocumento: true,
  plazoDiasTolerancia: true,
  creadoEn: true,
} as const;

const DOCUMENTO_SELECT = {
  id: true,
  personaId: true,
  tipoDocumento: true,
  fechaVencimiento: true,
  creadoEn: true,
} as const;

type RequisitoConAlcance = RequisitoExigido & { disciplinaId: number };

export type ResumenDocumental = Awaited<ReturnType<EstadoDocumentalService['porPersona']>>;

/** Lo exigido a una inscripción: lo de su disciplina más lo adicional de su categoría. */
function exigidosPara(
  requisitos: RequisitoConAlcance[],
  disciplinaId: number,
  categoriaDisciplinaId: number | null,
): RequisitoExigido[] {
  return requisitos.filter(
    (r) =>
      r.disciplinaId === disciplinaId &&
      (r.categoriaDisciplinaId === null || r.categoriaDisciplinaId === categoriaDisciplinaId),
  );
}

/**
 * US-25 / DT-27 — Estado documental de los participantes, calculado en el
 * momento a partir de requisitos, documentos y habilitaciones excepcionales.
 */
@Injectable()
export class EstadoDocumentalService {
  constructor(private readonly prisma: PrismaService) {}

  /** Estado de todas las inscripciones activas de una persona (detalle de US-25). */
  async porPersona(personaId: number, hoy = new Date()) {
    const persona = await this.prisma.persona.findUnique({
      where: { id: personaId },
      select: { id: true },
    });
    if (!persona) throw new NotFoundException('Participante no encontrado');
    const [resumen] = await this.calcular([personaId], hoy);
    return resumen;
  }

  /** Estado resumido de varias personas a la vez (listado de participantes, US-08). */
  async porPersonas(personaIds: number[], hoy = new Date()) {
    const resumenes = personaIds.length ? await this.calcular(personaIds, hoy) : [];
    return new Map(resumenes.map((r) => [r.personaId, r]));
  }

  /**
   * US-05: lo que se le va a exigir a una inscripción antes de confirmarla,
   * y si la persona (si ya existe) ya tiene presentado cada documento.
   */
  async previsualizar(
    disciplinaId: number,
    categoriaDisciplinaId: number | null,
    personaId: number | null,
    hoy = new Date(),
  ) {
    const [requisitos, documentos] = await Promise.all([
      this.prisma.disciplinaRequerimientoDoc.findMany({
        where: {
          disciplinaId,
          OR: [
            { categoriaDisciplinaId: null },
            ...(categoriaDisciplinaId ? [{ categoriaDisciplinaId }] : []),
          ],
        },
        select: REQUISITO_SELECT,
        orderBy: { tipoDocumento: 'asc' },
      }),
      personaId
        ? this.prisma.documentacion.findMany({ where: { personaId }, select: DOCUMENTO_SELECT })
        : Promise.resolve([] as DocumentoPresentado[]),
    ]);
    return estadoDeInscripcion(
      { fechaInscripcion: hoy, requisitosDesde: null },
      requisitos,
      documentos,
      [],
      hoy,
    );
  }

  /** Tipos de documento que se le exigen hoy a la persona (en alguna inscripción activa). */
  async tiposExigidos(personaId: number): Promise<TipoDocumentacionDisciplina[]> {
    const [resumen] = await this.calcular([personaId]);
    return resumen.tiposExigidos.map((t) => t.tipoDocumento);
  }

  private async calcular(personaIds: number[], hoy = new Date()) {
    const inscripciones = await this.prisma.inscripcion.findMany({
      where: { personaId: { in: personaIds }, activo: true },
      select: {
        id: true,
        personaId: true,
        disciplinaId: true,
        categoriaDisciplinaId: true,
        fechaInscripcion: true,
        requisitosDesde: true,
        disciplina: { select: { id: true, nombre: true } },
        categoriaDisciplina: { select: { id: true, nombre: true } },
        habilitacionesExcepcionales: { select: { hasta: true } },
      },
      orderBy: { disciplina: { nombre: 'asc' } },
    });
    const disciplinaIds = [...new Set(inscripciones.map((i) => i.disciplinaId))];
    const [requisitos, documentos] = await Promise.all([
      disciplinaIds.length
        ? this.prisma.disciplinaRequerimientoDoc.findMany({
            where: { disciplinaId: { in: disciplinaIds } },
            select: REQUISITO_SELECT,
            orderBy: { tipoDocumento: 'asc' },
          })
        : Promise.resolve([]),
      this.prisma.documentacion.findMany({
        where: { personaId: { in: personaIds } },
        select: DOCUMENTO_SELECT,
      }),
    ]);

    return personaIds.map((personaId) => {
      const propias = inscripciones.filter((i) => i.personaId === personaId);
      const docs = documentos.filter((d) => d.personaId === personaId);
      const detalle = propias.map((i) => {
        const exigidos = exigidosPara(requisitos, i.disciplinaId, i.categoriaDisciplinaId);
        const estado: EstadoDeInscripcion = estadoDeInscripcion(
          i,
          exigidos,
          docs,
          i.habilitacionesExcepcionales,
          hoy,
        );
        return {
          inscripcionId: i.id,
          disciplina: i.disciplina,
          categoriaDisciplina: i.categoriaDisciplina,
          ...estado,
        };
      });
      const tipos = [
        ...new Set(detalle.flatMap((d) => d.documentos.map((doc) => doc.tipoDocumento))),
      ].sort();
      return {
        personaId,
        estado: estadoGeneral(detalle.map((d) => d.estado)),
        inscripciones: detalle,
        /** Para el selector de carga (US-24): solo lo que se le exige, con su documento actual. */
        tiposExigidos: tipos.map((tipoDocumento) => {
          const actual = documentoVigentePorTipo(docs, tipoDocumento);
          return {
            tipoDocumento,
            etiqueta: ETIQUETA_TIPO_DOCUMENTO[tipoDocumento],
            documentoActualId: actual?.id ?? null,
          };
        }),
      };
    });
  }
}
