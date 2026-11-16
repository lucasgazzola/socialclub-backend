export const DEFAULT_EVENT_IMAGE_URL = 'socialclub-frontend/src/assets/favicon-blanco.png';

export interface EventoRaw {
  id: number;
  nombre: string;
  descripcion?: string | null;
  requiereEntrada?: boolean;
  capacidadMaxima?: number | null;
  entradasDisponibles?: number | null;
  precio: unknown;
  descuentoSocio?: number;
  estado: string;
  fechaEvento: Date | string;
  fechaFin?: Date | string | null;
  imagen?: string | null;
  lugarAcreditacion: string;
  inicioVenta?: Date | string | null;
  finVenta?: Date | string | null;
  creadoEn?: Date | string;
  actualizadoEn?: Date | string;
  _count?: { entradas: number };
}

export function mapEventoResponse(evento: EventoRaw) {
  const { _count, imagen, precio, requiereEntrada, descuentoSocio, ...rest } = evento;
  return {
    ...rest,
    requiereEntrada: requiereEntrada ?? true,
    capacidadMaxima: rest.capacidadMaxima ?? null,
    entradasDisponibles: rest.entradasDisponibles ?? null,
    precio: precio !== undefined && precio !== null ? String(precio) : '0',
    descuentoSocio: descuentoSocio ?? 0,
    imageUrl: imagen || DEFAULT_EVENT_IMAGE_URL,
    entradasVendidas: _count?.entradas ?? 0,
  };
}
