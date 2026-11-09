import { Injectable } from '@nestjs/common';
import { EstadoEvento, type TipoDocumentacionDisciplina } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PagosService } from '../pagos/pagos.service';
import { PagosDeportivosService } from '../pagos/pagos-deportivos.service';
import { estadoDeInscripcion, type DocumentoPresentado } from '../documentacion/estado-documental';
import {
  ComposicionIntegrantesDto,
  DashboardEventoDto,
  DashboardResponseDto,
  DisciplinaResumenDashboardDto,
  InscripcionesIrregularesDto,
  MorosidadPorConceptoDto,
} from './dto/dashboard-response.dto';

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

/**
 * US-34 · Ver dashboard de la organización.
 *
 * Módulo de agregación que consolida los indicadores clave del club:
 * - Integrantes activos (socios y participantes con membresía o inscripción activa) y su composición.
 * - Porcentaje y cantidad de morosos (personas únicas, sobre integrantes activos) y desglose por concepto.
 * - Documentos por vencer en los próximos 10 días (horario America/Argentina/Cordoba).
 * - Inscripciones irregulares y habilitadas (según el motor documental puro) y distribución por disciplina.
 * - Próximos hasta 5 eventos publicados.
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pagosService: PagosService,
    private readonly pagosDeportivosService: PagosDeportivosService,
  ) {}

  async getMetricas(ahora: Date = new Date()): Promise<DashboardResponseDto> {
    // Cálculo de fechas en huso horario America/Argentina/Cordoba (UTC-3)
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Argentina/Cordoba',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const [anio, mes, dia] = formatter.format(ahora).split('-').map(Number);
    const inicioHoy = new Date(Date.UTC(anio, mes - 1, dia, 0, 0, 0, 0));
    const finDiezDias = new Date(Date.UTC(anio, mes - 1, dia + 10, 23, 59, 59, 999));

    // Ejecución paralela de consultas base
    const [
      integrantesActivos,
      morososSociales,
      morososDeportivos,
      documentosPorVencer,
      eventos,
      inscripciones,
    ] = await Promise.all([
      // 1. Integrantes activos (Persona activa con membresía activa o inscripción activa)
      this.prisma.persona.findMany({
        where: {
          activo: true,
          OR: [
            { membresias: { some: { activo: true } } },
            { inscripciones: { some: { activo: true } } },
          ],
        },
        select: {
          id: true,
          membresias: { where: { activo: true }, select: { id: true } },
          inscripciones: { where: { activo: true }, select: { id: true } },
        },
      }),

      // 2. Morosos de cuota social y deportiva (reutilización de servicios existentes)
      this.pagosService.getMorososCuotaSocial({}, ahora),
      this.pagosDeportivosService.getMorosos({}, ahora),

      // 3. Documentos por vencer en los próximos 10 días de personas activas
      this.prisma.documentacion.count({
        where: {
          fechaVencimiento: {
            gte: inicioHoy,
            lte: finDiezDias,
          },
          persona: {
            activo: true,
          },
        },
      }),

      // 4. Próximos eventos (fechaFin >= ahora o, si fechaFin es null, fechaEvento >= ahora)
      this.prisma.evento.findMany({
        where: {
          estado: EstadoEvento.PUBLICADO,
          OR: [{ fechaFin: { gte: ahora } }, { fechaFin: null, fechaEvento: { gte: ahora } }],
        },
        orderBy: {
          fechaEvento: 'asc',
        },
        take: 5,
        select: {
          id: true,
          nombre: true,
          fechaEvento: true,
          fechaFin: true,
          lugarAcreditacion: true,
          capacidadMaxima: true,
          entradasDisponibles: true,
        },
      }),

      // 5. Inscripciones activas de personas activas para evaluación documental en lote
      this.prisma.inscripcion.findMany({
        where: {
          activo: true,
          persona: { activo: true },
        },
        select: {
          id: true,
          personaId: true,
          disciplinaId: true,
          categoriaDisciplinaId: true,
          fechaInscripcion: true,
          requisitosDesde: true,
          disciplina: { select: { nombre: true } },
          habilitacionesExcepcionales: { select: { hasta: true } },
        },
      }),
    ]);

    // ── Composición de integrantes activos ────────────────────────────────────
    const totalIntegrantesActivos = integrantesActivos.length;
    const activosSet = new Set(integrantesActivos.map((p) => p.id));

    let soloSocios = 0;
    let sociosDeportistas = 0;
    let soloDeportistas = 0;

    for (const p of integrantesActivos as Array<{
      id: number;
      membresias?: Array<{ id: number }>;
      inscripciones?: Array<{ id: number }>;
    }>) {
      const esSocio = (p.membresias?.length ?? 0) > 0;
      const esDeportista = (p.inscripciones?.length ?? 0) > 0;
      if (esSocio && esDeportista) {
        sociosDeportistas++;
      } else if (esSocio) {
        soloSocios++;
      } else if (esDeportista) {
        soloDeportistas++;
      }
    }

    const composicionIntegrantes: ComposicionIntegrantesDto = {
      soloSocios,
      sociosDeportistas,
      soloDeportistas,
    };

    // ── Cálculo de morosidad total y por concepto ─────────────────────────────
    const morososSocialSet = new Set<number>();
    const morososDeportivoSet = new Set<number>();
    const morososUnicos = new Set<number>();

    for (const item of morososSociales.items) {
      if (activosSet.has(item.personaId)) {
        morososSocialSet.add(item.personaId);
        morososUnicos.add(item.personaId);
      }
    }
    for (const item of morososDeportivos.items) {
      if (activosSet.has(item.personaId)) {
        morososDeportivoSet.add(item.personaId);
        morososUnicos.add(item.personaId);
      }
    }

    let ambasCuotas = 0;
    for (const personaId of morososSocialSet) {
      if (morososDeportivoSet.has(personaId)) {
        ambasCuotas++;
      }
    }

    const morosidadPorConcepto: MorosidadPorConceptoDto = {
      cuotaSocial: morososSocialSet.size,
      cuotaDeportiva: morososDeportivoSet.size,
      ambasCuotas,
    };

    const cantidadMorosos = morososUnicos.size;
    const porcentajeMorosos =
      totalIntegrantesActivos === 0
        ? 0
        : Number(((cantidadMorosos / totalIntegrantesActivos) * 100).toFixed(1));

    // ── Evaluación documental de inscripciones y ranking por disciplina (sin N+1)
    const disciplinaIds = [...new Set(inscripciones.map((i) => i.disciplinaId))];
    const personaIds = [...new Set(inscripciones.map((i) => i.personaId))];

    const [requisitos, documentos] = await Promise.all([
      disciplinaIds.length
        ? this.prisma.disciplinaRequerimientoDoc.findMany({
            where: { disciplinaId: { in: disciplinaIds } },
            select: REQUISITO_SELECT,
          })
        : Promise.resolve([]),
      personaIds.length
        ? this.prisma.documentacion.findMany({
            where: { personaId: { in: personaIds } },
            select: DOCUMENTO_SELECT,
          })
        : Promise.resolve([]),
    ]);

    const docsPorPersona = new Map<number, DocumentoPresentado[]>();
    for (const doc of documentos) {
      let lista = docsPorPersona.get(doc.personaId);
      if (!lista) {
        lista = [];
        docsPorPersona.set(doc.personaId, lista);
      }
      lista.push(doc);
    }

    type RequisitoItem = {
      disciplinaId: number;
      categoriaDisciplinaId: number | null;
      tipoDocumento: TipoDocumentacionDisciplina;
      plazoDiasTolerancia: number;
      creadoEn: Date;
    };

    const reqsPorDisciplina = new Map<number, RequisitoItem[]>();
    for (const req of requisitos as RequisitoItem[]) {
      let lista = reqsPorDisciplina.get(req.disciplinaId);
      if (!lista) {
        lista = [];
        reqsPorDisciplina.set(req.disciplinaId, lista);
      }
      lista.push(req);
    }

    let habilitadas = 0;
    let pendientes = 0;
    let bloqueadas = 0;

    const conteoDisciplinas = new Map<number, DisciplinaResumenDashboardDto>();

    for (const insc of inscripciones as Array<
      (typeof inscripciones)[number] & { disciplina?: { nombre: string } }
    >) {
      const reqs = (reqsPorDisciplina.get(insc.disciplinaId) ?? []).filter(
        (r) =>
          r.categoriaDisciplinaId === null ||
          r.categoriaDisciplinaId === insc.categoriaDisciplinaId,
      );
      const docs = docsPorPersona.get(insc.personaId) ?? [];
      const evaluacion = estadoDeInscripcion(
        {
          fechaInscripcion: insc.fechaInscripcion,
          requisitosDesde: insc.requisitosDesde,
        },
        reqs,
        docs,
        insc.habilitacionesExcepcionales,
        ahora,
      );

      let resumenDisc = conteoDisciplinas.get(insc.disciplinaId);
      if (!resumenDisc) {
        resumenDisc = {
          disciplinaId: insc.disciplinaId,
          nombre: insc.disciplina?.nombre ?? `Disciplina ${insc.disciplinaId}`,
          inscriptos: 0,
          habilitados: 0,
          irregulares: 0,
        };
        conteoDisciplinas.set(insc.disciplinaId, resumenDisc);
      }
      resumenDisc.inscriptos++;

      if (evaluacion.estado === 'PENDIENTE') {
        pendientes++;
        resumenDisc.irregulares++;
      } else if (evaluacion.estado === 'BLOQUEADO') {
        bloqueadas++;
        resumenDisc.irregulares++;
      } else {
        habilitadas++;
        resumenDisc.habilitados++;
      }
    }

    const participantesPorDisciplina = [...conteoDisciplinas.values()].sort(
      (a, b) => b.inscriptos - a.inscriptos || a.nombre.localeCompare(b.nombre),
    );

    const inscripcionesIrregulares: InscripcionesIrregularesDto = {
      total: pendientes + bloqueadas,
      pendientes,
      bloqueadas,
      habilitadas,
    };

    // ── Mapeo de eventos ──────────────────────────────────────────────────────
    const proximosEventos: DashboardEventoDto[] = eventos.map((e) => {
      const capacidad = e.capacidadMaxima ?? 0;
      const disponibles = e.entradasDisponibles ?? 0;
      const vendidas =
        e.capacidadMaxima !== null && e.entradasDisponibles !== null
          ? Math.max(0, capacidad - disponibles)
          : 0;

      return {
        id: e.id,
        nombre: e.nombre,
        fechaEvento: e.fechaEvento,
        fechaFin: e.fechaFin,
        lugarAcreditacion: e.lugarAcreditacion,
        capacidadMaxima: e.capacidadMaxima,
        entradasDisponibles: e.entradasDisponibles,
        entradasVendidas: vendidas,
      };
    });

    return {
      totalIntegrantesActivos,
      porcentajeMorosos,
      cantidadMorosos,
      documentosPorVencer,
      inscripcionesIrregulares,
      proximosEventos,
      composicionIntegrantes,
      morosidadPorConcepto,
      participantesPorDisciplina,
    };
  }
}
