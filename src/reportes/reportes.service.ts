import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PagosService } from '../pagos/pagos.service';
import { PagosDeportivosService } from '../pagos/pagos-deportivos.service';
import {
  cuotaVencida,
  DIA_VENCIMIENTO_CUOTA_DEPORTIVA,
} from '../pagos/vencimiento-cuota-deportiva';
import { EstadoFinancieroQueryDto } from './dto/estado-financiero-query.dto';

/** Meses máximos de un reporte (tres años). */
export const MAX_MESES_REPORTE = 36;

export type Concepto = 'CUOTA_SOCIAL' | 'CUOTA_DEPORTIVA';

export interface Indicadores {
  recaudado: number;
  adeudado: number;
  morosos: number;
  /** recaudado / (recaudado + adeudado) en %, con un decimal; null si no hay nada. */
  porcentajeCobranza: number | null;
}

const redondear = (n: number) => Math.round(n * 100) / 100;

function porcentaje(recaudado: number, adeudado: number): number | null {
  const base = recaudado + adeudado;
  return base > 0 ? Math.round((recaudado / base) * 1000) / 10 : null;
}

function indicadores(recaudado: number, adeudado: number, morosos: Set<number>): Indicadores {
  return {
    recaudado: redondear(recaudado),
    adeudado: redondear(adeudado),
    morosos: morosos.size,
    porcentajeCobranza: porcentaje(recaudado, adeudado),
  };
}

/** Meses "AAAA-MM" entre dos períodos, inclusive. */
export function mesesEntre(desde: string, hasta: string): string[] {
  const meses: string[] = [];
  let [anio, mes] = desde.split('-').map(Number);
  for (let i = 0; i <= MAX_MESES_REPORTE; i++) {
    const periodo = `${anio}-${String(mes).padStart(2, '0')}`;
    if (periodo > hasta) break;
    meses.push(periodo);
    mes += 1;
    if (mes > 12) {
      mes = 1;
      anio += 1;
    }
  }
  return meses;
}

/**
 * US-35 — Reporte de estado financiero.
 *
 * Se calcula sobre las cuotas de los meses del rango (decisión del equipo,
 * 10/10/2026):
 * - recaudado: lo cobrado de las cuotas de esos meses (social y deportiva);
 * - adeudado: las cuotas de esos meses ya vencidas (día 10 de su mes, para las
 *   dos cuotas) y sin pagar;
 * - morosos: personas con al menos una de esas cuotas adeudadas;
 * - porcentaje de cobranza: recaudado / (recaudado + adeudado).
 * Aparte, `ingresadoPorFechaDeCobro` es la caja: lo cobrado con fecha de pago
 * dentro del rango, de cualquier período.
 *
 * La deuda sale de los mismos cálculos que los listados de morosos (US-19 y
 * US-23), así los números coinciden entre pantallas. Con disciplina, el
 * reporte es solo de la cuota deportiva de esa disciplina.
 */
@Injectable()
export class ReportesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pagos: PagosService,
    private readonly pagosDeportivos: PagosDeportivosService,
  ) {}

  async estadoFinanciero(query: EstadoFinancieroQueryDto, hoy = new Date()) {
    const { desde, hasta, disciplinaId } = query;
    if (desde > hasta) {
      throw new BadRequestException('El período «desde» no puede ser posterior a «hasta».');
    }
    const meses = mesesEntre(desde, hasta);
    if (meses.length > MAX_MESES_REPORTE) {
      throw new BadRequestException(`El reporte abarca como máximo ${MAX_MESES_REPORTE} meses.`);
    }
    const enRango = (periodo: string) => periodo >= desde && periodo <= hasta;
    const incluyeSocial = !disciplinaId;

    const porMes = new Map(meses.map((m) => [m, { periodo: m, recaudado: 0, adeudado: 0 }]));
    const porDisciplina = new Map<
      number,
      {
        disciplinaId: number;
        disciplinaNombre: string;
        recaudado: number;
        adeudado: number;
        morosos: Set<number>;
      }
    >();
    const disciplina = (id: number, nombre: string) => {
      const d = porDisciplina.get(id) ?? {
        disciplinaId: id,
        disciplinaNombre: nombre,
        recaudado: 0,
        adeudado: 0,
        morosos: new Set<number>(),
      };
      porDisciplina.set(id, d);
      return d;
    };

    // ── Cuota deportiva ────────────────────────────────────────────────────
    const deportiva = { recaudado: 0, adeudado: 0, morosos: new Set<number>() };
    const pagosDeportivos = await this.prisma.pagoCuotaDeportiva.findMany({
      where: { periodo: { gte: desde, lte: hasta }, ...(disciplinaId ? { disciplinaId } : {}) },
      select: {
        monto: true,
        periodo: true,
        disciplinaId: true,
        disciplina: { select: { nombre: true } },
      },
    });
    for (const p of pagosDeportivos) {
      const monto = Number(p.monto);
      deportiva.recaudado += monto;
      porMes.get(p.periodo)!.recaudado += monto;
      disciplina(p.disciplinaId, p.disciplina.nombre).recaudado += monto;
    }
    const { items: morososDeportivos } = await this.pagosDeportivos.getMorosos(
      disciplinaId ? { disciplinaId } : {},
      hoy,
    );
    for (const m of morososDeportivos) {
      for (const d of m.disciplinas) {
        for (const c of d.cuotas.filter((c) => enRango(c.periodo))) {
          deportiva.adeudado += c.monto;
          deportiva.morosos.add(m.personaId);
          porMes.get(c.periodo)!.adeudado += c.monto;
          const acumulado = disciplina(d.disciplinaId, d.disciplinaNombre);
          acumulado.adeudado += c.monto;
          acumulado.morosos.add(m.personaId);
        }
      }
    }

    // ── Cuota social ───────────────────────────────────────────────────────
    const social = { recaudado: 0, adeudado: 0, morosos: new Set<number>() };
    if (incluyeSocial) {
      const pagosSociales = await this.prisma.pago.findMany({
        where: { periodo: { gte: desde, lte: hasta } },
        select: { monto: true, periodo: true },
      });
      for (const p of pagosSociales) {
        const monto = Number(p.monto);
        social.recaudado += monto;
        porMes.get(p.periodo)!.recaudado += monto;
      }
      const { items: morososSociales } = await this.pagos.getMorososCuotaSocial({});
      for (const m of morososSociales) {
        // Misma regla de vencimiento que la cuota deportiva (día 10).
        for (const c of m.cuotasPendientes.filter(
          (c) => enRango(c.periodo) && c.monto > 0 && cuotaVencida(c.periodo, hoy),
        )) {
          social.adeudado += c.monto;
          social.morosos.add(m.personaId);
          porMes.get(c.periodo)!.adeudado += c.monto;
        }
      }
    }

    // ── Caja: lo cobrado con fecha de pago dentro del rango ────────────────
    const [anioH, mesH] = hasta.split('-').map(Number);
    const fechas = { gte: new Date(`${desde}-01T00:00:00`), lt: new Date(anioH, mesH, 1) };
    const [cajaDeportiva, cajaSocial] = await Promise.all([
      this.prisma.pagoCuotaDeportiva.aggregate({
        _sum: { monto: true },
        where: { fechaPago: fechas, ...(disciplinaId ? { disciplinaId } : {}) },
      }),
      incluyeSocial
        ? this.prisma.pago.aggregate({ _sum: { monto: true }, where: { fechaPago: fechas } })
        : Promise.resolve({ _sum: { monto: 0 } }),
    ]);

    const morosos = new Set([...social.morosos, ...deportiva.morosos]);
    return {
      desde,
      hasta,
      disciplinaId: disciplinaId ?? null,
      diaVencimiento: DIA_VENCIMIENTO_CUOTA_DEPORTIVA,
      generadoEn: hoy.toISOString(),
      totales: {
        ...indicadores(
          social.recaudado + deportiva.recaudado,
          social.adeudado + deportiva.adeudado,
          morosos,
        ),
        ingresadoPorFechaDeCobro: redondear(
          Number(cajaDeportiva._sum.monto ?? 0) + Number(cajaSocial._sum.monto ?? 0),
        ),
      },
      porConcepto: [
        ...(incluyeSocial
          ? [
              {
                concepto: 'CUOTA_SOCIAL' as Concepto,
                ...indicadores(social.recaudado, social.adeudado, social.morosos),
              },
            ]
          : []),
        {
          concepto: 'CUOTA_DEPORTIVA' as Concepto,
          ...indicadores(deportiva.recaudado, deportiva.adeudado, deportiva.morosos),
        },
      ],
      porDisciplina: [...porDisciplina.values()]
        .map(({ morosos: m, ...d }) => ({ ...d, ...indicadores(d.recaudado, d.adeudado, m) }))
        .sort(
          (a, b) => b.adeudado - a.adeudado || a.disciplinaNombre.localeCompare(b.disciplinaNombre),
        ),
      porMes: [...porMes.values()].map((m) => ({
        periodo: m.periodo,
        recaudado: redondear(m.recaudado),
        adeudado: redondear(m.adeudado),
      })),
    };
  }
}
