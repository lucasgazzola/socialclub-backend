import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { CreateDisciplinaDto } from './dto/create-disciplina.dto';
import { UpdateDisciplinaDto } from './dto/update-disciplina.dto';

@Injectable()
export class DisciplinasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async create(dto: CreateDisciplinaDto, responsableId: number) {
    const existente = await this.prisma.disciplina.findUnique({
      where: { nombre: dto.nombre },
    });
    if (existente) {
      throw new ConflictException('Ya existe una disciplina con ese nombre');
    }

    const disciplina = await this.prisma.disciplina.create({ data: dto });

    await this.auditoria.registrar({
      accion: 'CREAR',
      entidad: 'Disciplina',
      idEntidad: disciplina.id,
      responsableId,
    });

    return disciplina;
  }

  async findAll() {
  return this.prisma.disciplina.findMany({
    orderBy: { nombre: 'asc' },
    include: {
      categorias: {
        where: { activo: true },
        orderBy: { nombre: 'asc' },
        select: {
          id: true,
          nombre: true,
          activo: true,
        },
      },
      _count: {
        select: {
          configuracionesCuotaDeportiva: true,
        },
      },
    },
  });
}

  async findOne(id: number) {
    const disciplina = await this.prisma.disciplina.findUnique({
      where: { id },
      include: {
        configuracionesCuotaDeportiva: {
          include: { categoria: true },
          orderBy: { periodoAplicacion: 'desc' },
        },
      },
    });
    if (!disciplina) {
      throw new NotFoundException('Disciplina no encontrada');
    }
    return disciplina;
  }

  async update(id: number, dto: UpdateDisciplinaDto, responsableId: number) {
    await this.findOne(id);

    if (dto.nombre) {
      const existente = await this.prisma.disciplina.findUnique({
        where: { nombre: dto.nombre },
      });
      if (existente && existente.id !== id) {
        throw new ConflictException('Ya existe una disciplina con ese nombre');
      }
    }

    const disciplina = await this.prisma.disciplina.update({
      where: { id },
      data: dto,
    });

    await this.auditoria.registrar({
      accion: 'EDITAR',
      entidad: 'Disciplina',
      idEntidad: id,
      responsableId,
    });

    return disciplina;
  }

  async deactivate(id: number, responsableId: number) {
    await this.findOne(id);

    const disciplina = await this.prisma.disciplina.update({
      where: { id },
      data: { activo: false },
    });

    await this.auditoria.registrar({
      accion: 'BAJA',
      entidad: 'Disciplina',
      idEntidad: id,
      responsableId,
    });

    return disciplina;
  }
}
