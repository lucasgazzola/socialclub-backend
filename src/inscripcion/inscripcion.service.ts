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
        
        let persona = await tx.persona.findUnique({ where: { dni: dto.dni } });
        
        if (!persona) {
          persona = await tx.persona.create({
            data: {
              nombre: dto.nombre,
              apellido: dto.apellido,
              dni: dto.dni,
              fechaNacimiento: dto.fechaNacimiento? new Date(dto.fechaNacimiento): undefined,
              email: dto.email,
              telefono: dto.telefono,
            },
          });
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

        const valorCuota = await this.obtenerValorCuota(
          tx,
          dto.disciplinaId,
          dto.categoriaDisciplinaId ?? null,
        );

        let cuota = null;
        if (valorCuota) {
          cuota = await tx.cuotaParticipante.create({
            data: {
              inscripcionId: inscripcion.id,
              valorCuotaId: valorCuota.id,
              periodo: this.periodoActual(),
              monto: valorCuota.monto,
              fechaVencimiento: this.calcularFechaVencimiento(),
            },
          });
        }

        await tx.registroAuditoria.create({
          data: {
            accion: 'CREAR',
            entidad: 'Inscripcion',
            idEntidad: inscripcion.id,
            detalle: 'Inscripción de ${persona.apellido} ${persona.nombre}, ${persona.dni} en la disciplina ${disciplina.nombre}',
            responsableId,
          },
        });
        
        return {
          persona,
          inscripcion,
          cuotaGenerada: cuota,
          ...(cuota? {}: {aviso: 'No hay un valor de cuota vigente configurado para esta disciplina/categoría; la inscripción se confirmó sin generar cuota.',}),
        }; 

      })

    } catch (error) {
      //si dos requests concurrentes pasan la verificación 2b al mismo tiempo, el
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

  private async obtenerValorCuota(tx: Prisma.TransactionClient, disciplinaId: number, categoriaDisciplinaId: number | null,) {
    const condicionVigencia = {
      activo: true,
      vigenteDesde: { lte: new Date() },
    } as const;
 
    if (categoriaDisciplinaId) {
      const valorPorCategoria = await tx.valorCuotaDisciplina.findFirst({
        where: {
          disciplinaId,
          categoriaDisciplinaId,
          ...condicionVigencia,
        },
        orderBy: { vigenteDesde: 'desc' },
      });
      if (valorPorCategoria) return valorPorCategoria;
    }
 
    return tx.valorCuotaDisciplina.findFirst({
      where: {
        disciplinaId,
        categoriaDisciplinaId: null,
        ...condicionVigencia,
      },
      orderBy: { vigenteDesde: 'desc' },
    });
  }
 
  private periodoActual(): string {
    const ahora = new Date();
    const mes = String(ahora.getMonth() + 1).padStart(2, '0');
    return `${ahora.getFullYear()}-${mes}`;
  }
 
  private calcularFechaVencimiento(): Date {
    // Ajustar según la regla de negocio real del club (ej. día fijo del mes).
    const vencimiento = new Date();
    vencimiento.setDate(vencimiento.getDate() + 30);
    return vencimiento;
  }
}


