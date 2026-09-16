import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInscripcionDto } from './dto/create-inscripcion.dto';
import { UpdateInscripcionDto } from './dto/update-inscripcion.dto';
import {
  EstadoInscripcionFiltro,
  FindParticipantesQueryDto,
} from './dto/find-participantes-query.dto';
import { AuditoriaService } from '../auditoria/auditoria.service';

type InscConRelaciones = Pick<
  Prisma.InscripcionGetPayload<{
    include: { persona: true; disciplina: true; categoriaDisciplina: true };
  }>,
  | 'id'
  | 'disciplinaId'
  | 'disciplina'
  | 'categoriaDisciplinaId'
  | 'categoriaDisciplina'
  | 'fechaInscripcion'
  | 'activo'
>;

type PersonaConInscripciones = Prisma.PersonaGetPayload<{
  include: { inscripciones: { include: { disciplina: true; categoriaDisciplina: true } } };
}>;

@Injectable()
export class InscripcionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async create(dto: CreateInscripcionDto, responsableId: number) {
    const disciplina = await this.prisma.disciplina.findUnique({
      where: { id: dto.disciplinaId },
      include: { categorias: true },
    });

    if (!disciplina) {
      throw new NotFoundException('Disciplina no encontrada');
    }

    if (!disciplina.activo) {
      throw new BadRequestException('Disciplina inactiva');
    }

    const tieneCategorias = disciplina.categorias.length > 0;

    if (tieneCategorias && !dto.categoriaDisciplinaId) {
      throw new BadRequestException(
        'Debe seleccionar una categoría para inscribirse en esta disciplina',
      );
    }

    if (dto.categoriaDisciplinaId) {
      const categoriaValida = disciplina.categorias.some(
        (c) => c.id === dto.categoriaDisciplinaId && c.activo,
      );
      if (!categoriaValida) {
        throw new BadRequestException(
          'La categoría indicada no pertenece a esta disciplina o no está activa',
        );
      }
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        let persona;

        // Modo 1: ya conocemos al participante (lo buscamos por DNI previamente).
        if (dto.personaId) {
          persona = await tx.persona.findUnique({ where: { id: dto.personaId } });
          if (!persona) {
            throw new NotFoundException('Participante no encontrado');
          }
        } else {
          // Modo 2: participante nuevo. Localizamos el DNI; si no existe, se crea
          // con sus datos básicos. Estos campos se exigen aquí (modo 2).
          const nombre = dto.nombre;
          const apellido = dto.apellido;
          const dni = dto.dni;

          if (!nombre || !apellido || !dni) {
            throw new BadRequestException(
              'Faltan los datos básicos del participante nuevo (nombre, apellido y DNI)',
            );
          }

          persona = await tx.persona.findUnique({ where: { dni } });

          if (!persona) {
            persona = await tx.persona.create({
              data: {
                nombre,
                apellido,
                dni,
                fechaNacimiento: dto.fechaNacimiento ? new Date(dto.fechaNacimiento) : undefined,
                email: dto.email,
                telefono: dto.telefono,
              },
            });
          }
        }

        const inscripcionExistente = await tx.inscripcion.findUnique({
          where: {
            personaId_disciplinaId: {
              personaId: persona.id,
              disciplinaId: dto.disciplinaId,
            },
          },
        });

        if (inscripcionExistente?.activo) {
          throw new ConflictException(
            'Ya existe un participante con ese DNI inscripto en esta disciplina',
          );
        }

        // El unique (personaId, disciplinaId) hace que la fila sobreviva a la
        // baja lógica, así que una re-inscripción no puede insertar otra:
        // reactiva la que ya está.
        if (inscripcionExistente) {
          const reactivada = await tx.inscripcion.update({
            where: { id: inscripcionExistente.id },
            data: {
              activo: true,
              fechaInscripcion: new Date(),
              categoriaDisciplinaId: dto.categoriaDisciplinaId ?? null,
            },
          });

          await this.auditoria.registrar(
            {
              accion: 'REACTIVAR',
              entidad: 'Inscripcion',
              idEntidad: reactivada.id,
              detalle: `Re-inscripción de ${persona.apellido} ${persona.nombre}, ${persona.dni} en la disciplina ${disciplina.nombre}`,
              responsableId,
            },
            tx,
          );

          return { persona, inscripcion: reactivada };
        }

        const inscripcion = await tx.inscripcion.create({
          data: {
            personaId: persona.id,
            disciplinaId: dto.disciplinaId,
            categoriaDisciplinaId: dto.categoriaDisciplinaId ?? null,
          },
        });

        await tx.registroAuditoria.create({
          data: {
            accion: 'CREAR',
            entidad: 'Inscripcion',
            idEntidad: inscripcion.id,
            detalle: `Inscripción de ${persona.apellido} ${persona.nombre}, ${persona.dni} en la disciplina ${disciplina.nombre}`,
            responsableId,
          },
        });

        return { persona, inscripcion };
      });
    } catch (error) {
      // Si dos requests concurrentes pasan la verificación al mismo tiempo, el
      // constraint único de la DB corta el segundo insert acá.
      if (error instanceof PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Ya existe una persona registrada con ese DNI');
      }
      throw error;
    }
  }

  async update(id: number, dto: UpdateInscripcionDto, responsableId: number) {
    const inscripcionActual = await this.prisma.inscripcion.findUnique({
      where: { id },
      include: {
        persona: true,
        disciplina: { include: { categorias: true } },
        categoriaDisciplina: true,
      },
    });
    if (!inscripcionActual) throw new NotFoundException('Inscripción no encontrada');
    if (!inscripcionActual.activo) {
      throw new BadRequestException(
        'La inscripción está dada de baja: hay que reinscribir al participante antes de editarlo',
      );
    }

    const disciplinaIdDestino = dto.disciplinaId ?? inscripcionActual.disciplinaId;
    const disciplinaDestino = await this.prisma.disciplina.findUnique({
      where: { id: disciplinaIdDestino },
      include: { categorias: true },
    });
    if (!disciplinaDestino) throw new NotFoundException('Disciplina destino no encontrada');
    if (!disciplinaDestino.activo) throw new BadRequestException('Disciplina inactiva');

    const tieneCategorias = disciplinaDestino.categorias.length > 0;
    const disciplinaCambio = disciplinaIdDestino !== inscripcionActual.disciplinaId;

    let categoriaIdDestino: number | null;
    if ('categoriaDisciplinaId' in dto) {
      categoriaIdDestino = dto.categoriaDisciplinaId ?? null;
    } else if (disciplinaCambio) {
      categoriaIdDestino = null;
    } else {
      categoriaIdDestino = inscripcionActual.categoriaDisciplinaId ?? null;
    }

    if (tieneCategorias && categoriaIdDestino === null) {
      throw new BadRequestException('Debe seleccionar una categoría para esta disciplina');
    }

    if (categoriaIdDestino) {
      const categoriaValida = disciplinaDestino.categorias.some(
        (c) => c.id === categoriaIdDestino && c.activo,
      );
      if (!categoriaValida) {
        throw new BadRequestException(
          'La categoría indicada no pertenece a esta disciplina o no está activa',
        );
      }
    }

    const dniNuevo = dto.dni ?? inscripcionActual.persona.dni;
    const dniCambio = dniNuevo !== inscripcionActual.persona.dni;

    // Con el unique (personaId, disciplinaId), si el participante ya tuvo una
    // inscripción en la disciplina destino esa fila sigue existiendo aunque
    // esté dada de baja, así que no se le puede mover el disciplinaId encima.
    let inscripcionInactivaEnDestino: { id: number } | null = null;
    if (disciplinaCambio) {
      const existenteEnDestino = await this.prisma.inscripcion.findUnique({
        where: {
          personaId_disciplinaId: {
            personaId: inscripcionActual.personaId,
            disciplinaId: disciplinaIdDestino,
          },
        },
      });

      if (existenteEnDestino?.activo) {
        throw new ConflictException('El participante ya está inscripto en la disciplina destino');
      }

      inscripcionInactivaEnDestino = existenteEnDestino ?? null;
    }

    // El DNI nuevo puede pertenecer a OTRA persona que ya esté inscripta y
    // vigente en la disciplina destino. Si el DNI no cambia, el choque contra
    // el unique ya lo cubre la verificación de arriba.
    if (dniCambio && dniNuevo) {
      const personaConMismoDni = await this.prisma.persona.findUnique({
        where: { dni: dniNuevo },
      });

      if (personaConMismoDni && personaConMismoDni.id !== inscripcionActual.personaId) {
        const yaInscripto = await this.prisma.inscripcion.findUnique({
          where: {
            personaId_disciplinaId: {
              personaId: personaConMismoDni.id,
              disciplinaId: disciplinaIdDestino,
            },
          },
        });

        // Solo choca contra una inscripción vigente: una dada de baja no
        // ocupa el lugar de nadie.
        if (yaInscripto?.activo) {
          throw new ConflictException('Ya existe un participante con ese DNI en esta disciplina');
        }
      }
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const personaActualizada = await tx.persona.update({
          where: { id: inscripcionActual.personaId },
          data: {
            nombre: dto.nombre ?? inscripcionActual.persona.nombre,
            apellido: dto.apellido ?? inscripcionActual.persona.apellido,
            dni: dniNuevo,
            fechaNacimiento: dto.fechaNacimiento
              ? new Date(dto.fechaNacimiento)
              : inscripcionActual.persona.fechaNacimiento,
            email: dto.email ?? inscripcionActual.persona.email,
            telefono: dto.telefono ?? inscripcionActual.persona.telefono,
          },
        });

        // Traslado a una disciplina donde el participante ya tuvo una
        // inscripción: se reactiva esa fila y la actual queda dada de baja. La
        // inscripción resultante cambia de id.
        const inscripcionActualizada = inscripcionInactivaEnDestino
          ? await tx.inscripcion.update({
              where: { id: inscripcionInactivaEnDestino.id },
              data: {
                activo: true,
                fechaInscripcion: new Date(),
                categoriaDisciplinaId: categoriaIdDestino,
              },
              include: { persona: true, disciplina: true, categoriaDisciplina: true },
            })
          : await tx.inscripcion.update({
              where: { id },
              data: {
                disciplinaId: disciplinaIdDestino,
                categoriaDisciplinaId: categoriaIdDestino,
              },
              include: { persona: true, disciplina: true, categoriaDisciplina: true },
            });

        if (inscripcionInactivaEnDestino) {
          await tx.inscripcion.update({ where: { id }, data: { activo: false } });

          await this.auditoria.registrar(
            {
              accion: 'BAJA',
              entidad: 'Inscripcion',
              idEntidad: id,
              detalle: `Baja por traslado de ${personaActualizada.apellido} ${personaActualizada.nombre} a la disciplina ${disciplinaDestino.nombre}`,
              responsableId,
            },
            tx,
          );

          await this.auditoria.registrar(
            {
              accion: 'REACTIVAR',
              entidad: 'Inscripcion',
              idEntidad: inscripcionActualizada.id,
              detalle: `Reactivación por traslado de ${personaActualizada.apellido} ${personaActualizada.nombre} desde la disciplina ${inscripcionActual.disciplina.nombre}`,
              responsableId,
            },
            tx,
          );
        }

        let categoriaNuevaNombre = 'sin categoría';
        if (categoriaIdDestino) {
          const cat = await tx.categoriaDisciplina.findUnique({
            where: { id: categoriaIdDestino },
          });
          if (cat) categoriaNuevaNombre = cat.nombre;
        }

        await tx.registroAuditoria.create({
          data: {
            accion: 'EDITAR',
            entidad: 'Inscripcion',
            idEntidad: inscripcionActualizada.id,
            detalle: `Edición de participante ${personaActualizada.apellido} ${personaActualizada.nombre}, DNI ${personaActualizada.dni} - disciplina: ${inscripcionActual.disciplina.nombre} → ${disciplinaDestino.nombre}, categoría: ${inscripcionActual.categoriaDisciplina?.nombre ?? 'sin categoría'} → ${categoriaNuevaNombre}`,
            responsableId,
          },
        });

        return { persona: personaActualizada, inscripcion: inscripcionActualizada };
      });
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Ya existe un participante con ese DNI en esta disciplina');
      }
      throw error;
    }
  }

  /**
   * Convierte una inscripción (con sus relaciones cargadas) al item
   * individual que consume el detalle por participante.
   */

  /**
   * Convierte una inscripción (con sus relaciones cargadas) al item
   * individual que consume el detalle por participante.
   */
  private aDisciplinaInscripta(inscripcion: InscConRelaciones) {
    return {
      inscripcionId: inscripcion.id,
      disciplinaId: inscripcion.disciplinaId,
      disciplina: inscripcion.disciplina,
      categoriaDisciplinaId: inscripcion.categoriaDisciplinaId ?? null,
      categoriaDisciplina: inscripcion.categoriaDisciplina ?? null,
      fechaInscripcion: inscripcion.fechaInscripcion,
      activo: inscripcion.activo,
      estado: inscripcion.activo ? 'INSCRIPTO' : 'BAJA',
    };
  }

  /**
   * Convierte una persona (con sus inscripciones cargadas) a la fila del
   * listado de participantes (US-08): una fila por participante con todas
   * sus disciplinas. El estado agregado es INSCRIPTO si tiene al menos una
   * inscripción activa, BAJA en caso contrario.
   */
  private aParticipanteAgrupado(persona: PersonaConInscripciones) {
    const disciplinas = [...persona.inscripciones]
      .sort((a, b) => a.disciplina.nombre.localeCompare(b.disciplina.nombre, 'es'))
      .map((i) => this.aDisciplinaInscripta(i));
    return {
      personaId: persona.id,
      persona,
      disciplinas,
      cantidadDisciplinas: disciplinas.length,
      estado: disciplinas.some((d) => d.activo) ? 'INSCRIPTO' : 'BAJA',
    };
  }

  /**
   * US-08: Buscar y filtrar participantes.
   * - Búsqueda por nombre, apellido o DNI (coincidencia exacta o parcial, sin distinguir mayúsculas).
   * - Filtro por disciplina deportiva (participantes con al menos una inscripción en esa disciplina).
   * - Filtro por estado agregado del participante (INSCRIPTO: al menos una inscripción
   *   activa, BAJA: ninguna activa).
   * - Los filtros se combinan entre sí (AND) y la paginación se resuelve en el backend.
   * Cada fila representa a un participante con todas sus disciplinas.
   */
  async findAll(query: FindParticipantesQueryDto = { pagina: 1, porPagina: 10 }) {
    const { busqueda, disciplinaId, estado, pagina, porPagina } = query;

    const filtros: Prisma.PersonaWhereInput[] = [
      // Solo personas que participan en al menos una disciplina.
      { inscripciones: { some: {} } },
    ];

    if (busqueda && busqueda.trim()) {
      const termino = busqueda.trim();
      filtros.push({
        OR: [
          { nombre: { contains: termino, mode: 'insensitive' } },
          { apellido: { contains: termino, mode: 'insensitive' } },
          { dni: { contains: termino, mode: 'insensitive' } },
          { dni: { equals: termino } },
        ],
      });
    }

    if (disciplinaId) {
      filtros.push({ inscripciones: { some: { disciplinaId } } });
    }

    if (estado === EstadoInscripcionFiltro.INSCRIPTO) {
      filtros.push({ inscripciones: { some: { activo: true } } });
    } else if (estado === EstadoInscripcionFiltro.BAJA) {
      filtros.push({ inscripciones: { none: { activo: true } } });
    }

    const where: Prisma.PersonaWhereInput = { AND: filtros };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.persona.findMany({
        where,
        include: {
          inscripciones: {
            include: {
              disciplina: true,
              categoriaDisciplina: true,
            },
            orderBy: { disciplina: { nombre: 'asc' } },
          },
        },
        orderBy: [{ apellido: 'asc' }, { nombre: 'asc' }],
        skip: (pagina - 1) * porPagina,
        take: porPagina,
      }),
      this.prisma.persona.count({ where }),
    ]);

    return {
      items: items.map((p) => this.aParticipanteAgrupado(p)),
      total,
      pagina,
      porPagina,
    };
  }

  async findByPersonaId(personaId: number) {
    return this.prisma.inscripcion.findMany({
      where: { personaId, activo: true },
      include: {
        persona: true,
        disciplina: true,
        categoriaDisciplina: true,
      },
      orderBy: { fechaInscripcion: 'desc' },
    });
  }

  async findOne(id: number) {
    const inscripcion = await this.prisma.inscripcion.findUnique({
      where: { id },
      include: {
        persona: true,
        disciplina: true,
        categoriaDisciplina: true,
      },
    });
    if (!inscripcion) {
      throw new NotFoundException('Inscripción no encontrada');
    }
    return inscripcion;
  }

  /**
   * DT-16: baja lógica y auditada. Antes hacía un DELETE físico sin registrar
   * nada, así que una inscripción podía desaparecer sin dejar rastro de quién
   * la borró. La fila se conserva porque el unique (personaId, disciplinaId)
   * la necesita para poder reinscribir a la misma persona más adelante.
   */
  async remove(id: number, responsableId: number) {
    const inscripcion = await this.findOne(id);

    if (!inscripcion.activo) {
      throw new BadRequestException('La inscripción ya está dada de baja');
    }

    return this.prisma.$transaction(async (tx) => {
      const dadaDeBaja = await tx.inscripcion.update({
        where: { id },
        data: { activo: false },
        include: { persona: true, disciplina: true, categoriaDisciplina: true },
      });

      await this.auditoria.registrar(
        {
          accion: 'BAJA',
          entidad: 'Inscripcion',
          idEntidad: id,
          detalle: `Baja de la inscripción de ${inscripcion.persona.apellido} ${inscripcion.persona.nombre}, DNI ${inscripcion.persona.dni} en la disciplina ${inscripcion.disciplina.nombre}`,
          responsableId,
        },
        tx,
      );

      return dadaDeBaja;
    });
  }
}
