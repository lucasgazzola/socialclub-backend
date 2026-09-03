import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { CrearEventoDto } from './dto/crear-evento.dto';
import { FiltrarEventosDto } from './dto/filtrar-eventos.dto';

/**
 * Servicio del modulo Eventos.
 *
 * Expone la lectura de eventos con filtros opcionales por texto (search),
 * disponibilidad y orden. La lógica de filtrado se delega a Prisma para
 * que el front no necesite implementarla.
 */
@Injectable()
export class EventosService {
  constructor(
  private readonly prisma: PrismaService,
  private readonly auditoria: AuditoriaService,
) {}

  async findAll(filtros?: FiltrarEventosDto) {
    const { search, soloDisponibles, ordenar } = filtros ?? {};

    const items = await this.prisma.evento.findMany({
      where: {
        // Búsqueda case-insensitive en nombre O descripción
        ...(search
          ? {
              OR: [
                { nombre: { contains: search, mode: 'insensitive' } },
                { descripcion: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
        // Filtro de disponibilidad: solo eventos con cupo > 0
        ...(soloDisponibles === 'true'
          ? { entradasDisponibles: { gt: 0 } }
          : {}),
      },
      orderBy: ordenar === 'reciente' ? { creadoEn: 'desc' } : { nombre: 'asc' },
      include: {
        _count: { select: { entradas: true } },
      },
    });

    // `_count.entradas` se expone como `entradasVendidas` para la pantalla.
    return items.map(({ _count, ...evento }: { _count: { entradas: number }; [key: string]: unknown }) => ({
      ...evento,
      entradasVendidas: _count.entradas,
    }));

  }

  async findOne(id: number) {
    const evento = await this.prisma.evento.findUnique({
      where: { id },
      include: {
        _count: { select: { entradas: true } },
      },
    });

    if (!evento) {
      throw new NotFoundException('Evento no encontrado');
    }

    const { _count, ...rest } = evento;
    return { ...rest, entradasVendidas: _count.entradas };
  }

  async create(dto: CrearEventoDto, responsableId: number) {
  const evento = await this.prisma.evento.create({
    data: {
      nombre: dto.nombre,
      descripcion: dto.descripcion,
      entradasDisponibles: dto.entradasDisponibles,
    },
  });

  await this.auditoria.registrar({
    accion: 'CREAR',
    entidad: 'Evento',
    idEntidad: evento.id,
    responsableId,
  });

  return evento;
}
  
}


