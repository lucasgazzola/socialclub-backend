import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TipoBloqueo, TipoEspacio } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { intervalosDeBloqueo, seSolapan } from '../reservas/agenda';
import { CreateEspacioDto, CreateSubespacioDto } from './dto/create-espacio.dto';
import { CreateBloqueoDto } from './dto/create-bloqueo.dto';
import { FindEspaciosQueryDto } from './dto/find-espacios-query.dto';

@Injectable()
export class EspaciosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  /**
   * US-55 — Registrar un nuevo espacio físico (único o contenedor con sub-espacios
   * bajo el Patrón Composite), disciplinas compatibles y bloqueos de agenda.
   */
  async create(dto: CreateEspacioDto, responsableId: number) {
    // Criterio 2: disciplinas compatibles solo para DEPORTIVO o MULTIUSO
    if (dto.tipo === TipoEspacio.SOCIAL && dto.disciplinaIds && dto.disciplinaIds.length > 0) {
      throw new BadRequestException(
        'Los espacios de tipo SOCIAL no pueden asociarse a disciplinas deportivas.',
      );
    }

    // Validación de montos principales
    if (dto.montoSena > dto.precio) {
      throw new BadRequestException(
        'El monto de la seña requerida no puede ser superior al precio total de alquiler.',
      );
    }

    // Validación de jerarquía Composite (espacioPadreId)
    if (dto.espacioPadreId) {
      if (
        (dto.cantidadSubespacios && dto.cantidadSubespacios > 0) ||
        (dto.subespacios && dto.subespacios.length > 0)
      ) {
        throw new BadRequestException(
          'Un sub-espacio que ya pertenece a un espacio padre no puede subdividirse en más niveles.',
        );
      }

      const padre = await this.prisma.espacio.findUnique({
        where: { id: dto.espacioPadreId },
        select: { id: true, activo: true, espacioPadreId: true },
      });

      if (!padre || !padre.activo) {
        throw new NotFoundException('El espacio padre indicado no existe o se encuentra inactivo.');
      }

      if (padre.espacioPadreId !== null) {
        throw new BadRequestException(
          'No se puede asignar como padre a un sub-espacio; la jerarquía admite dos niveles (Padre -> Sub-espacio).',
        );
      }
    }

    // Verificar existencia de disciplinas si fueron enviadas
    if (dto.disciplinaIds && dto.disciplinaIds.length > 0) {
      const disciplinasEncontradas = await this.prisma.disciplina.findMany({
        where: { id: { in: dto.disciplinaIds }, activa: true },
        select: { id: true },
      });

      if ((disciplinasEncontradas?.length ?? 0) !== dto.disciplinaIds.length) {
        throw new BadRequestException(
          'Una o más disciplinas indicadas no existen o se encuentran inactivas.',
        );
      }
    }

    // Preparar unidades hijas (Patrón Composite: por lista explícita o por lote)
    const unidadesHijas: CreateSubespacioDto[] = [];
    if (dto.subespacios && dto.subespacios.length > 0) {
      for (const sub of dto.subespacios) {
        const precioSub = sub.precio ?? dto.precio;
        const senaSub = sub.montoSena ?? dto.montoSena;
        if (senaSub > precioSub) {
          throw new BadRequestException(
            `El monto de la seña del sub-espacio "${sub.nombre}" no puede superar su precio de alquiler.`,
          );
        }
        unidadesHijas.push(sub);
      }
    } else if (dto.cantidadSubespacios && dto.cantidadSubespacios > 0) {
      const prefijo = dto.prefijoSubespacio?.trim() || dto.nombre.trim();
      for (let i = 1; i <= dto.cantidadSubespacios; i++) {
        unidadesHijas.push({
          nombre: `${prefijo} ${i}`,
          capacidadMaxima: dto.capacidadSubespacio ?? dto.capacidadMaxima,
        });
      }
    }

    // Validar bloqueos iniciales si fueron provistos
    if (dto.bloqueos && dto.bloqueos.length > 0) {
      for (const bloqueo of dto.bloqueos) {
        this.validarBloqueo(bloqueo, dto.disciplinaIds);
      }
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Crear espacio principal (único o padre contenedor)
      const espacio = await tx.espacio.create({
        data: {
          nombre: dto.nombre.trim(),
          tipo: dto.tipo,
          capacidadMaxima: dto.capacidadMaxima,
          modalidad: dto.modalidad,
          ubicacion: dto.ubicacion?.trim() || null,
          descripcion: dto.descripcion?.trim() || null,
          espacioPadreId: dto.espacioPadreId ?? null,
          precio: new Prisma.Decimal(dto.precio),
          precioSocio: dto.precioSocio ? new Prisma.Decimal(dto.precioSocio) : null,
          montoSena: new Prisma.Decimal(dto.montoSena),
          activo: true,
        },
      });

      // 2. Asociar disciplinas compatibles al espacio principal
      if (dto.disciplinaIds && dto.disciplinaIds.length > 0) {
        await tx.espacioDisciplina.createMany({
          data: dto.disciplinaIds.map((disciplinaId) => ({
            espacioId: espacio.id,
            disciplinaId,
          })),
        });
      }

      // 3. Crear sub-espacios hijos si corresponde (Patrón Composite)
      if (unidadesHijas.length > 0) {
        for (const sub of unidadesHijas) {
          const hijo = await tx.espacio.create({
            data: {
              nombre: sub.nombre.trim(),
              tipo: dto.tipo,
              capacidadMaxima: sub.capacidadMaxima ?? dto.capacidadMaxima,
              modalidad: dto.modalidad,
              ubicacion: dto.ubicacion?.trim() || null,
              descripcion: sub.descripcion?.trim() || dto.descripcion?.trim() || null,
              espacioPadreId: espacio.id,
              precio: new Prisma.Decimal(sub.precio ?? dto.precio),
              precioSocio:
                sub.precioSocio !== undefined
                  ? new Prisma.Decimal(sub.precioSocio)
                  : dto.precioSocio
                    ? new Prisma.Decimal(dto.precioSocio)
                    : null,
              montoSena: new Prisma.Decimal(sub.montoSena ?? dto.montoSena),
              activo: true,
            },
          });

          if (dto.disciplinaIds && dto.disciplinaIds.length > 0) {
            await tx.espacioDisciplina.createMany({
              data: dto.disciplinaIds.map((disciplinaId) => ({
                espacioId: hijo.id,
                disciplinaId,
              })),
            });
          }
        }
      }

      // 4. Crear bloqueos de agenda iniciales
      if (dto.bloqueos && dto.bloqueos.length > 0) {
        for (const b of dto.bloqueos) {
          await tx.bloqueoAgenda.create({
            data: {
              espacioId: espacio.id,
              tipo: b.tipo,
              diasSemana: b.tipo === TipoBloqueo.RECURRENTE ? (b.diasSemana ?? []) : [],
              fecha: b.tipo === TipoBloqueo.PUNTUAL && b.fecha ? new Date(b.fecha) : null,
              horaInicio: b.horaInicio ?? null,
              horaFin: b.horaFin ?? null,
              vigenteDesde: b.vigenteDesde ? new Date(b.vigenteDesde) : null,
              vigenteHasta: b.vigenteHasta ? new Date(b.vigenteHasta) : null,
              disciplinaId: b.disciplinaId ?? null,
              motivo: b.motivo?.trim() || null,
              creadoPorId: responsableId,
              activo: true,
            },
          });
        }
      }

      // 5. Registro de auditoría inalterable (RN-ESP04 / RN14)
      const sufijoSubespacios =
        unidadesHijas.length > 0 ? ` con ${unidadesHijas.length} sub-espacios` : '';
      await this.auditoria.registrar(
        {
          accion: 'CREAR',
          entidad: 'Espacio',
          idEntidad: espacio.id,
          responsableId,
          detalle: `Creación de espacio: ${espacio.nombre} (${espacio.tipo}, capacidad: ${espacio.capacidadMaxima})${sufijoSubespacios}`,
        },
        tx,
      );

      return tx.espacio.findUniqueOrThrow({
        where: { id: espacio.id },
        include: {
          disciplinas: { include: { disciplina: { select: { id: true, nombre: true } } } },
          bloqueos: { where: { activo: true } },
          espacioPadre: { select: { id: true, nombre: true } },
          subespacios: {
            where: { activo: true },
            orderBy: { id: 'asc' },
          },
        },
      });
    });
  }

  /**
   * US-55 / US-56 — Configurar un nuevo bloqueo de agenda para un espacio.
   * Criterio 6 + Patrón Composite: Si choca con alquileres particulares aprobados
   * en el propio espacio, en su padre o en cualquiera de sus sub-espacios hijos, advierte el conflicto.
   */
  async agregarBloqueo(espacioId: number, dto: CreateBloqueoDto, responsableId: number) {
    const espacio = await this.prisma.espacio.findUnique({
      where: { id: espacioId },
      include: {
        disciplinas: true,
        subespacios: { where: { activo: true }, select: { id: true, nombre: true } },
      },
    });

    if (!espacio || !espacio.activo) {
      throw new NotFoundException('Espacio no encontrado o inactivo');
    }

    const disciplinasCompatibles = espacio.disciplinas.map((d) => d.disciplinaId);
    this.validarBloqueo(dto, disciplinasCompatibles);

    // Patrón Composite: recolectar todos los IDs de espacios afectados por este bloqueo
    // (el propio espacio + su padre si es sub-espacio + sus hijos si es espacio contenedor)
    const idsEspaciosRelacionados: number[] = [espacioId];
    if (espacio.espacioPadreId) {
      idsEspaciosRelacionados.push(espacio.espacioPadreId);
    }
    if (espacio.subespacios && espacio.subespacios.length > 0) {
      for (const sub of espacio.subespacios) {
        idsEspaciosRelacionados.push(sub.id);
      }
    }

    // Criterio 6: validar conflicto con alquileres particulares ya aprobados o confirmados
    const reservasOcupan = await this.prisma.reserva.findMany({
      where: {
        espacioId: { in: idsEspaciosRelacionados },
        estado: { in: ['APROBADA_PENDIENTE_PAGO', 'CONFIRMADA'] },
      },
      select: { id: true, codigo: true, inicio: true, fin: true, espacioId: true },
    });

    if (reservasOcupan.length > 0) {
      const dummyBloqueo = {
        tipo: dto.tipo,
        diasSemana: dto.diasSemana ?? [],
        fecha: dto.fecha ? new Date(dto.fecha) : null,
        horaInicio: dto.horaInicio ?? null,
        horaFin: dto.horaFin ?? null,
        vigenteDesde: dto.vigenteDesde ? new Date(dto.vigenteDesde) : null,
        vigenteHasta: dto.vigenteHasta ? new Date(dto.vigenteHasta) : null,
        activo: true,
      };

      for (const res of reservasOcupan) {
        const rangoReserva = { inicio: res.inicio, fin: res.fin };
        const intervalos = intervalosDeBloqueo(dummyBloqueo, rangoReserva);
        const hayConflicto = intervalos.some((i) => seSolapan(i, rangoReserva));
        if (hayConflicto) {
          throw new ConflictException(
            `El bloqueo entra en conflicto con la reserva particular aprobada ${res.codigo}. Debe gestionar la cancelación manual justificada de la reserva antes de bloquear el turno.`,
          );
        }
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const bloqueo = await tx.bloqueoAgenda.create({
        data: {
          espacioId,
          tipo: dto.tipo,
          diasSemana: dto.tipo === TipoBloqueo.RECURRENTE ? (dto.diasSemana ?? []) : [],
          fecha: dto.tipo === TipoBloqueo.PUNTUAL && dto.fecha ? new Date(dto.fecha) : null,
          horaInicio: dto.horaInicio ?? null,
          horaFin: dto.horaFin ?? null,
          vigenteDesde: dto.vigenteDesde ? new Date(dto.vigenteDesde) : null,
          vigenteHasta: dto.vigenteHasta ? new Date(dto.vigenteHasta) : null,
          disciplinaId: dto.disciplinaId ?? null,
          motivo: dto.motivo?.trim() || null,
          creadoPorId: responsableId,
          activo: true,
        },
        include: {
          disciplina: { select: { id: true, nombre: true } },
        },
      });

      await this.auditoria.registrar(
        {
          accion: 'CREAR',
          entidad: 'BloqueoAgenda',
          idEntidad: bloqueo.id,
          responsableId,
          detalle: `Creación de bloqueo (${bloqueo.tipo}) en espacio ${espacio.nombre}: ${bloqueo.motivo ?? 'Sin motivo'}`,
        },
        tx,
      );

      return bloqueo;
    });
  }

  /**
   * Listar espacios físicos con sus disciplinas asociadas y sub-espacios (Patrón Composite).
   * Si se solicita con paginación o filtro de pestaña (`pagina`, `porPagina` o `estado`),
   * devuelve `{ items, total, pagina, porPagina, counts: { todos, activos, inactivos } }`.
   */
  async findAll(query: FindEspaciosQueryDto) {
    const whereBase: Prisma.EspacioWhereInput = {};

    if (query.tipo) {
      whereBase.tipo = query.tipo;
    }

    if (query.modalidad) {
      whereBase.modalidad = query.modalidad;
    }

    if (query.espacioPadreId !== undefined) {
      whereBase.espacioPadreId = query.espacioPadreId;
    } else if (query.soloRaiz) {
      whereBase.espacioPadreId = null;
    }

    if (query.busqueda && query.busqueda.trim()) {
      const busqueda = query.busqueda.trim();
      whereBase.OR = [
        { nombre: { contains: busqueda, mode: 'insensitive' } },
        { ubicacion: { contains: busqueda, mode: 'insensitive' } },
      ];
    }

    const direccion: 'asc' | 'desc' = query.orden?.toLowerCase() === 'desc' ? 'desc' : 'asc';
    let orderBy: Prisma.EspacioOrderByWithRelationInput = { nombre: 'asc' };

    if (query.ordenarPor) {
      switch (query.ordenarPor.toLowerCase()) {
        case 'tipo':
          orderBy = { tipo: direccion };
          break;
        case 'capacidadmaxima':
        case 'capacidad':
          orderBy = { capacidadMaxima: direccion };
          break;
        case 'precio':
          orderBy = { precio: direccion };
          break;
        case 'montosena':
        case 'sena':
          orderBy = { montoSena: direccion };
          break;
        case 'nombre':
        default:
          orderBy = { nombre: direccion };
          break;
      }
    }

    const include = {
      disciplinas: {
        include: {
          disciplina: { select: { id: true, nombre: true } },
        },
      },
      espacioPadre: {
        select: { id: true, nombre: true },
      },
      subespacios: {
        where: { activo: true },
        orderBy: { id: 'asc' as const },
        select: {
          id: true,
          nombre: true,
          capacidadMaxima: true,
          precio: true,
          precioSocio: true,
          montoSena: true,
          activo: true,
        },
      },
      _count: {
        select: {
          bloqueos: { where: { activo: true } },
          reservas: true,
          subespacios: { where: { activo: true } },
        },
      },
    };

    const usaContratoPaginado =
      query.pagina !== undefined || query.porPagina !== undefined || query.estado !== undefined;

    if (usaContratoPaginado) {
      const pagina = query.pagina ?? 1;
      const porPagina = query.porPagina ?? 10;
      const whereActivos: Prisma.EspacioWhereInput = { ...whereBase, activo: true };
      const whereInactivos: Prisma.EspacioWhereInput = { ...whereBase, activo: false };

      let where: Prisma.EspacioWhereInput = whereBase;
      if (query.estado === 'activos' || query.activo === true) {
        where = whereActivos;
      } else if (query.estado === 'inactivos' || query.activo === false) {
        where = whereInactivos;
      }

      const [items, total, totalTodos, totalActivos, totalInactivos] =
        await this.prisma.$transaction([
          this.prisma.espacio.findMany({
            where,
            orderBy,
            skip: (pagina - 1) * porPagina,
            take: porPagina,
            include,
          }),
          this.prisma.espacio.count({ where }),
          this.prisma.espacio.count({ where: whereBase }),
          this.prisma.espacio.count({ where: whereActivos }),
          this.prisma.espacio.count({ where: whereInactivos }),
        ]);

      return {
        items,
        total,
        pagina,
        porPagina,
        counts: {
          todos: totalTodos,
          activos: totalActivos,
          inactivos: totalInactivos,
        },
      };
    }

    const whereSimple: Prisma.EspacioWhereInput = {
      ...whereBase,
      activo: query.activo !== undefined ? query.activo : true,
    };

    return this.prisma.espacio.findMany({
      where: whereSimple,
      orderBy,
      include,
    });
  }

  /**
   * Consultar detalle de un espacio específico con su jerarquía Composite.
   */
  async findOne(id: number) {
    const espacio = await this.prisma.espacio.findUnique({
      where: { id },
      include: {
        disciplinas: {
          include: {
            disciplina: { select: { id: true, nombre: true } },
          },
        },
        espacioPadre: {
          select: { id: true, nombre: true, ubicacion: true },
        },
        subespacios: {
          where: { activo: true },
          orderBy: { id: 'asc' },
        },
        bloqueos: {
          where: { activo: true },
          include: {
            disciplina: { select: { id: true, nombre: true } },
          },
          orderBy: [{ fecha: 'asc' }, { horaInicio: 'asc' }],
        },
      },
    });

    if (!espacio) {
      throw new NotFoundException('Espacio no encontrado');
    }

    return espacio;
  }

  /**
   * Validación interna de reglas de bloqueo (Criterios 3, 4 y 7).
   */
  private validarBloqueo(bloqueo: CreateBloqueoDto, disciplinasCompatibles?: number[]) {
    if (bloqueo.tipo === TipoBloqueo.RECURRENTE) {
      // Criterio 3: bloqueos recurrentes indicando días de la semana, franja horaria y vigencia
      if (!bloqueo.diasSemana || bloqueo.diasSemana.length === 0) {
        throw new BadRequestException(
          'Los bloqueos recurrentes deben indicar al menos un día de la semana (0 a 6).',
        );
      }

      if (!bloqueo.horaInicio || !bloqueo.horaFin) {
        throw new BadRequestException(
          'Los bloqueos recurrentes deben indicar franja horaria completa (horaInicio y horaFin).',
        );
      }

      if (bloqueo.horaFin <= bloqueo.horaInicio) {
        throw new BadRequestException(
          'La hora de fin del bloqueo debe ser posterior a la hora de inicio.',
        );
      }

      if (!bloqueo.vigenteHasta) {
        throw new BadRequestException(
          'Los bloqueos recurrentes deben indicar la fecha límite de vigencia (vigenteHasta).',
        );
      }

      if (
        bloqueo.vigenteDesde &&
        bloqueo.vigenteHasta &&
        new Date(bloqueo.vigenteHasta) < new Date(bloqueo.vigenteDesde)
      ) {
        throw new BadRequestException(
          'La fecha límite de vigencia (vigenteHasta) no puede ser anterior a vigenteDesde.',
        );
      }

      if (
        bloqueo.disciplinaId &&
        disciplinasCompatibles &&
        !disciplinasCompatibles.includes(bloqueo.disciplinaId)
      ) {
        throw new BadRequestException(
          'La disciplina asociada al bloqueo debe ser una de las disciplinas compatibles con el espacio.',
        );
      }
    } else if (bloqueo.tipo === TipoBloqueo.PUNTUAL) {
      // Criterio 4: bloqueos puntuales con fecha, rango horario o día completo, y motivo
      if (!bloqueo.fecha) {
        throw new BadRequestException(
          'Los bloqueos puntuales deben indicar una fecha específica (fecha).',
        );
      }

      if (!bloqueo.motivo || !bloqueo.motivo.trim()) {
        throw new BadRequestException('El motivo es obligatorio para bloqueos puntuales.');
      }

      // Si especifica horario, debe ser rango completo y coherente; si no, es día completo
      if (bloqueo.horaInicio || bloqueo.horaFin) {
        if (!bloqueo.horaInicio || !bloqueo.horaFin) {
          throw new BadRequestException(
            'Para configurar un rango horario en un bloqueo puntual debe indicar tanto horaInicio como horaFin.',
          );
        }
        if (bloqueo.horaFin <= bloqueo.horaInicio) {
          throw new BadRequestException(
            'La hora de fin del bloqueo debe ser posterior a la hora de inicio.',
          );
        }
      }
    }
  }
}
