import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { CrearEventoDto } from './dto/crear-evento.dto';

/**
 * Servicio del modulo Eventos.
 *
 * Por ahora expone la lectura de eventos (listar y obtener por id). La creacion
 * de eventos no esta implementada.
 */
@Injectable()
export class EventosService {
  constructor(
  private readonly prisma: PrismaService,
  private readonly auditoria: AuditoriaService,
) {}

  async findAll() {
    const items = await this.prisma.evento.findMany({
      orderBy: { nombre: 'asc' },
      include: {
        _count: { select: { entradas: true } },
      },
    });

    // `_count.entradas` se expone como `entradasVendidas` para la pantalla.
    return items.map(({ _count, ...evento }) => ({
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


