import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInscripcionDto } from './dto/create-inscripcion.dto';
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
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new ConflictException('Ya existe una persona registrada con ese DNI');
      }
      throw error;
    }

  }

  findAll() {
    return `This action returns all inscripcion`;
  }

  findOne(id: number) {
    return `This action returns a #${id} inscripcion`;
  }

  remove(id: number) {
    return `This action removes a #${id} inscripcion`;
  }

}
