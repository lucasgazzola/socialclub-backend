import { Injectable } from '@nestjs/common';
import { escapar, PlantillaEmail } from '../notificaciones/plantillas/plantilla-email';
import type { TipoNotificacion } from '../notificaciones/notificaciones.types';

export interface DatosCompraEntradas {
  eventoNombre: string;
  fechaEvento: string;
  lugarAcreditacion: string;
  cantidad: number;
  precioUnitario: string;
  montoTotal: string;
}

/** DT-36 / DT-31 — Aviso al comprador cuando se confirma su compra de entradas. */
@Injectable()
export class CompraEntradasPlantilla extends PlantillaEmail<DatosCompraEntradas> {
  readonly tipo: TipoNotificacion = 'COMPRA_ENTRADAS';

  protected asunto(d: DatosCompraEntradas): string {
    return `SocialClub · Confirmación de compra: ${d.eventoNombre}`;
  }

  protected titulo(d: DatosCompraEntradas): string {
    void d;
    return '¡Compra de entradas confirmada!';
  }

  protected introduccion(d: DatosCompraEntradas): string {
    return `Confirmamos tu compra de ${d.cantidad} entrada(s) para el evento "${d.eventoNombre}".`;
  }

  private renglones(d: DatosCompraEntradas): [string, string][] {
    return [
      ['Evento', d.eventoNombre],
      ['Fecha', d.fechaEvento],
      ['Lugar de acreditación', d.lugarAcreditacion],
      ['Cantidad', `${d.cantidad}`],
      ['Precio unitario', d.precioUnitario],
      ['Total abonado', d.montoTotal],
    ];
  }

  protected cuerpoTexto(d: DatosCompraEntradas): string {
    return this.renglones(d)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n');
  }

  protected cuerpoHtml(d: DatosCompraEntradas): string {
    const filas = this.renglones(d)
      .map(
        ([k, v]) =>
          `<tr><td style="padding:6px 10px;color:#475569">${escapar(k)}</td><td style="padding:6px 10px;font-weight:bold">${escapar(v)}</td></tr>`,
      )
      .join('');
    return `<table style="border-collapse:collapse;font-size:14px">${filas}</table>`;
  }
}
