import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { CreateDocumentacionDto } from './dto/create-documentacion.dto';

@Injectable()
export class DocumentacionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  /**
   * US-24: Carga un documento obligatorio para un participante.
   * Reglas:
   * - El integrante (Persona) debe existir.
   * - La fecha de vencimiento es obligatoria (validada en el DTO).
   * - La fecha de vencimiento no puede ser anterior a la fecha actual.
   */
  async create(dto: CreateDocumentacionDto, responsableId: number) {
    const persona = await this.prisma.persona.findUnique({ where: { id: dto.personaId } });
    if (!persona) {
      throw new NotFoundException('Participante no encontrado');
    }

    // Una fecha "YYYY-MM-DD" se interpreta en horario LOCAL (si se parsea como
    // UTC, en zonas negativas "hoy" se corre un día y rompe la comparación).
    const soloFecha = /^(\d{4})-(\d{2})-(\d{2})/.exec(dto.fechaVencimiento);
    const fechaVencimiento = soloFecha
      ? new Date(Number(soloFecha[1]), Number(soloFecha[2]) - 1, Number(soloFecha[3]))
      : new Date(dto.fechaVencimiento);

    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0); // se compara por día: un documento que vence hoy es válido.
    const diaVencimiento = new Date(
      fechaVencimiento.getFullYear(),
      fechaVencimiento.getMonth(),
      fechaVencimiento.getDate(),
    );
    if (diaVencimiento < hoy) {
      throw new BadRequestException(
        'La fecha de vencimiento no puede ser anterior a la fecha actual.',
      );
    }

    const documentacion = await this.prisma.documentacion.create({
      data: {
        tipo: dto.tipo.trim(),
        fechaVencimiento,
        personaId: dto.personaId,
      },
    });

    await this.auditoria.registrar({
      accion: 'CREAR',
      entidad: 'Documentacion',
      idEntidad: documentacion.id,
      responsableId,
      detalle: `Documento "${documentacion.tipo}" cargado para la persona id=${dto.personaId}`,
    });

    return documentacion;
  }

  /** Lista la documentación cargada de un participante (vencimiento más próximo primero). */
  async findByPersona(personaId: number) {
    const persona = await this.prisma.persona.findUnique({ where: { id: personaId } });
    if (!persona) {
      throw new NotFoundException('Participante no encontrado');
    }

    return this.prisma.documentacion.findMany({
      where: { personaId },
      orderBy: { fechaVencimiento: 'asc' },
    });
  }
}
