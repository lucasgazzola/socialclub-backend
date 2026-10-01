import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { ActualizarPersonaDto } from './dto/actualizar-persona.dto';

@Injectable()
export class PersonasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  /**
   * Busca un participante por DNI incluyendo sus inscripciones vigentes
   * (con disciplina y categoría anidadas). Es el endpoint que usa el flujo
   * de inscripción para reconocer a un participante ya registrado.
   */
  async findByDni(dni: string) {
    const persona = await this.prisma.persona.findUnique({
      where: { dni },
      include: {
        inscripciones: {
          where: { activo: true },
          include: {
            disciplina: { select: { id: true, nombre: true } },
            categoriaDisciplina: { select: { id: true, nombre: true } },
          },
        },
      },
    });

    if (!persona) {
      throw new NotFoundException('No hay ningún participante registrado con ese DNI');
    }

    return persona;
  }

  /**
   * US-06: edición de los datos básicos de un participante. Es el camino que
   * usa la página de edición cuando el participante no tiene inscripciones
   * vigentes (US-07: un dado de baja sigue siendo participante). Nunca se
   * borra nada: update + auditoría.
   */
  async update(id: number, dto: ActualizarPersonaDto, responsableId?: number) {
    const persona = await this.prisma.persona.findUnique({ where: { id } });
    if (!persona) {
      throw new NotFoundException('Participante no encontrado');
    }

    if (dto.dni && dto.dni !== persona.dni) {
      const dniOcupado = await this.prisma.persona.findUnique({ where: { dni: dto.dni } });
      if (dniOcupado) {
        throw new ConflictException('Ya existe un participante con ese DNI');
      }
    }

    const actualizada = await this.prisma.persona.update({
      where: { id },
      data: {
        nombre: dto.nombre ?? persona.nombre,
        apellido: dto.apellido ?? persona.apellido,
        dni: dto.dni ?? persona.dni,
        fechaNacimiento: dto.fechaNacimiento
          ? new Date(dto.fechaNacimiento)
          : persona.fechaNacimiento,
        email: dto.email ?? persona.email,
        telefono: dto.telefono ?? persona.telefono,
      },
    });

    await this.auditoria.registrar({
      accion: 'EDITAR',
      entidad: 'Persona',
      idEntidad: id,
      detalle: `Edición de datos del participante ${actualizada.apellido} ${actualizada.nombre}, DNI ${actualizada.dni}`,
      responsableId,
    });

    return actualizada;
  }
}
