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
import { AuditoriaService } from '../auditoria/auditoria.service';

@Injectable()
export class InscripcionService {

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async create(dto: CreateInscripcionDto, responsableId: number) {

    const disciplina = await this.prisma.disciplina.findUnique({where: { id: dto.disciplinaId }, include: { categorias: true },});

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
      const categoriaValida = disciplina.categorias.some((c) => c.id === dto.categoriaDisciplinaId && c.activo,);
      if (!categoriaValida) {
        throw new BadRequestException(
          'La categoría indicada no pertenece a esta disciplina o no está activa',
        );
      }
    }

    try{
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

        if (inscripcionExistente) {
          throw new ConflictException(
            'Ya existe un participante con ese DNI inscripto en esta disciplina',
          );
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

        return {persona, inscripcion,};

      })

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
        c => c.id === categoriaIdDestino && c.activo
      );
      if (!categoriaValida) {
        throw new BadRequestException('La categoría indicada no pertenece a esta disciplina o no está activa');
      }
    }

    const dniNuevo = dto.dni ?? inscripcionActual.persona.dni;
    const dniCambio = dniNuevo !== inscripcionActual.persona.dni;
    
    if (dniCambio || disciplinaCambio) {
      const personaConMismoDni = await this.prisma.persona.findUnique({ where: { dni: dniNuevo } });
      if (personaConMismoDni) {
        const yaInscripto = await this.prisma.inscripcion.findUnique({
          where: { personaId_disciplinaId: { personaId: personaConMismoDni.id, disciplinaId: disciplinaIdDestino } },
        });
        if (yaInscripto) {
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
            fechaNacimiento: dto.fechaNacimiento ? new Date(dto.fechaNacimiento) : inscripcionActual.persona.fechaNacimiento,
            email: dto.email ?? inscripcionActual.persona.email,
            telefono: dto.telefono ?? inscripcionActual.persona.telefono,
          },
        });

        const inscripcionActualizada = await tx.inscripcion.update({
          where: { id },
          data: {
            disciplinaId: disciplinaIdDestino,
            categoriaDisciplinaId: categoriaIdDestino,
          },
          include: { persona: true, disciplina: true, categoriaDisciplina: true },
        });

        let categoriaNuevaNombre = 'sin categoría';
        if (categoriaIdDestino) {
          const cat = await tx.categoriaDisciplina.findUnique({ where: { id: categoriaIdDestino } });
          if (cat) categoriaNuevaNombre = cat.nombre;
        }

        await tx.registroAuditoria.create({
          data: {
            accion: 'EDITAR',
            entidad: 'Inscripcion',
            idEntidad: id,
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

  async findAll() {
    return this.prisma.inscripcion.findMany({
      include: {
        persona: true,
        disciplina: true,
        categoriaDisciplina: true,
      },
      orderBy: { fechaInscripcion: 'desc' },
    });
  }

  async findByPersonaId(personaId: number) {
    return this.prisma.inscripcion.findMany({
      where: { personaId },
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

  async remove(id: number) {
    const inscripcion = await this.findOne(id);
    await this.prisma.inscripcion.delete({ where: { id } });
    return inscripcion;
  }
}