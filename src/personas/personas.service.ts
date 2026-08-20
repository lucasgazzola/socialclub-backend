import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PersonasService {
  constructor(private readonly prisma: PrismaService) {}

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
}
