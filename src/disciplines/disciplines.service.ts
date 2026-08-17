import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateDisciplineDto } from './dto/create-discipline.dto';
import { UpdateDisciplineDto } from './dto/update-discipline.dto';

@Injectable()
export class DisciplinesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateDisciplineDto, responsibleId: number) {
    const existente = await this.prisma.discipline.findUnique({
      where: { name: dto.name },
    });
    if (existente) {
      throw new ConflictException('Ya existe una disciplina con ese nombre');
    }

    const disciplina = await this.prisma.discipline.create({ data: dto });

    await this.audit.record({
      action: 'CREATE',
      entity: 'Discipline',
      entityId: disciplina.id,
      responsibleId,
    });

    return disciplina;
  }

  async findAll() {
    return this.prisma.discipline.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { feeConfigs: true } },
      },
    });
  }

  async findOne(id: number) {
    const disciplina = await this.prisma.discipline.findUnique({
      where: { id },
      include: {
        feeConfigs: {
          include: { category: true },
          orderBy: { appliedPeriod: 'desc' },
        },
      },
    });
    if (!disciplina) {
      throw new NotFoundException('Disciplina no encontrada');
    }
    return disciplina;
  }

  async update(id: number, dto: UpdateDisciplineDto, responsibleId: number) {
    await this.findOne(id);

    if (dto.name) {
      const existente = await this.prisma.discipline.findUnique({
        where: { name: dto.name },
      });
      if (existente && existente.id !== id) {
        throw new ConflictException('Ya existe una disciplina con ese nombre');
      }
    }

    const disciplina = await this.prisma.discipline.update({
      where: { id },
      data: dto,
    });

    await this.audit.record({
      action: 'UPDATE',
      entity: 'Discipline',
      entityId: id,
      responsibleId,
    });

    return disciplina;
  }

  async deactivate(id: number, responsibleId: number) {
    await this.findOne(id);

    const disciplina = await this.prisma.discipline.update({
      where: { id },
      data: { active: false },
    });

    await this.audit.record({
      action: 'DEACTIVATE',
      entity: 'Discipline',
      entityId: id,
      responsibleId,
    });

    return disciplina;
  }
}
