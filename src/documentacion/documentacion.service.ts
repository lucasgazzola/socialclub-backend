import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { TipoDocumentacionDisciplina } from '@prisma/client';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { CreateDocumentacionDto } from './dto/create-documentacion.dto';
import { getStorageDir, type ArchivoSubido } from './storage.config';
import { ETIQUETA_TIPO_DOCUMENTO, requiereVencimiento } from '../disciplinas/requerimientos-doc';
import { EstadoDocumentalService } from './estado-documental.service';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { RevisionDocumentacionPlantilla } from './revision-documentacion.plantilla';
import type { SubirMiDocumentacionDto } from './dto/subir-mi-documentacion.dto';

const ROLES_STAFF = ['ADMIN', 'DELEGADO', 'COLABORADOR'];

@Injectable()
export class DocumentacionService {
  private readonly logger = new Logger(DocumentacionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
    private readonly estadoDocumental: EstadoDocumentalService,
    private readonly notificaciones: NotificacionesService,
    private readonly plantillaRevision: RevisionDocumentacionPlantilla,
  ) {}

  /**
   * US-24: Carga un documento obligatorio para un participante.
   * Reglas:
   * - El integrante (Persona) debe existir.
   * - La fecha de vencimiento es obligatoria salvo para el DNI (DT-43).
   * - Si se indica fecha de vencimiento, no puede ser anterior a la fecha actual.
   * - El tipo es del catálogo y tiene que estar exigido por alguna disciplina o
   *   categoría en la que el participante esté inscripto. Un documento nuevo
   *   del mismo tipo reemplaza al anterior para la habilitación (renovación);
   *   el anterior se conserva como histórico.
   */
  async create(dto: CreateDocumentacionDto, responsableId: number, archivo?: ArchivoSubido) {
    const { fechaVencimiento, tipo } = await this.validarCarga(dto.personaId, dto);

    const documentacion = await this.prisma.documentacion.create({
      data: {
        tipoDocumento: dto.tipoDocumento,
        tipo,
        fechaVencimiento,
        personaId: dto.personaId,
        // Archivo opcional: en la BD solo la referencia; el binario vive en disco.
        archivoNombre: archivo?.originalname ?? null,
        archivoRuta: archivo?.filename ?? null,
        mimeType: archivo?.mimetype ?? null,
        tamano: archivo?.size ?? null,
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

  /**
   * Reglas comunes a toda carga (US-24 y TASK-60): la persona existe, la fecha
   * de vencimiento es obligatoria salvo para el DNI y no está vencida, y el
   * tipo lo exige alguna disciplina o categoría en la que está inscripta.
   */
  private async validarCarga(
    personaId: number,
    dto: { tipoDocumento: TipoDocumentacionDisciplina; fechaVencimiento?: string; tipo?: string },
  ) {
    const persona = await this.prisma.persona.findUnique({ where: { id: personaId } });
    if (!persona) {
      throw new NotFoundException('Participante no encontrado');
    }

    const rawFecha = dto.fechaVencimiento?.trim();
    if (!rawFecha && requiereVencimiento(dto.tipoDocumento)) {
      throw new BadRequestException('La fecha de vencimiento es obligatoria.');
    }

    let fechaVencimiento: Date | null = null;
    if (rawFecha) {
      // Una fecha "YYYY-MM-DD" se interpreta en horario LOCAL (si se parsea como
      // UTC, en zonas negativas "hoy" se corre un día y rompe la comparación).
      const soloFecha = /^(\d{4})-(\d{2})-(\d{2})/.exec(rawFecha);
      fechaVencimiento = soloFecha
        ? new Date(Number(soloFecha[1]), Number(soloFecha[2]) - 1, Number(soloFecha[3]))
        : new Date(rawFecha);

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
    }

    const exigidos = await this.estadoDocumental.tiposExigidos(personaId);
    if (!exigidos.includes(dto.tipoDocumento)) {
      throw new BadRequestException(
        `Ninguna disciplina o categoría del participante exige «${ETIQUETA_TIPO_DOCUMENTO[dto.tipoDocumento]}».`,
      );
    }

    return {
      fechaVencimiento,
      tipo: dto.tipo?.trim() || ETIQUETA_TIPO_DOCUMENTO[dto.tipoDocumento],
    };
  }

  /**
   * TASK-60 — El titular sube su propio documento desde Mi club. Queda en
   * revisión hasta que un delegado o el administrador lo aprueba: mientras
   * tanto no cuenta para la habilitación. El archivo es obligatorio.
   */
  async subirPropia(usuarioId: number, dto: SubirMiDocumentacionDto, archivo?: ArchivoSubido) {
    if (!archivo) {
      throw new BadRequestException('Adjuntá el archivo del documento (PDF o imagen).');
    }
    const personaId = await this.obtenerPersonaIdDeUsuario(usuarioId);
    const { fechaVencimiento, tipo } = await this.validarCarga(personaId, dto);

    const enRevision = await this.prisma.documentacion.findFirst({
      where: { personaId, tipoDocumento: dto.tipoDocumento, estadoRevision: 'PENDIENTE_REVISION' },
      select: { id: true },
    });
    if (enRevision) {
      throw new ConflictException(`Ya enviaste «${tipo}» y está en revisión.`);
    }

    const documentacion = await this.prisma.documentacion.create({
      data: {
        tipoDocumento: dto.tipoDocumento,
        tipo,
        fechaVencimiento,
        personaId,
        archivoNombre: archivo.originalname,
        archivoRuta: archivo.filename,
        mimeType: archivo.mimetype,
        tamano: archivo.size,
        estadoRevision: 'PENDIENTE_REVISION',
        cargadoPorTitular: true,
      },
    });

    await this.auditoria.registrar({
      accion: 'CREAR',
      entidad: 'Documentacion',
      idEntidad: documentacion.id,
      responsableId: usuarioId,
      detalle: `Documento "${tipo}" subido por el titular (persona id=${personaId}); queda en revisión`,
    });

    return documentacion;
  }

  /**
   * DT-42 — Disciplinas cuyos documentos revisa el usuario: `null` = todas
   * (ADMIN); el delegado, solo las que tiene a cargo.
   */
  private async disciplinasACargo(user: AuthenticatedUser): Promise<number[] | null> {
    if (user.roles.includes('ADMIN')) return null;
    const asignadas = await this.prisma.delegadoDisciplina.findMany({
      where: { usuarioId: user.id },
      select: { disciplinaId: true },
    });
    return asignadas.map((a) => a.disciplinaId);
  }

  /** TASK-60 — Documentos que subieron los titulares y esperan revisión (los más viejos primero). */
  async pendientesRevision(user: AuthenticatedUser) {
    const disciplinas = await this.disciplinasACargo(user);
    if (disciplinas && !disciplinas.length) return [];
    return this.prisma.documentacion.findMany({
      where: {
        estadoRevision: 'PENDIENTE_REVISION',
        ...(disciplinas
          ? {
              persona: {
                inscripciones: { some: { activo: true, disciplinaId: { in: disciplinas } } },
              },
            }
          : {}),
      },
      orderBy: { creadoEn: 'asc' },
      include: {
        persona: {
          select: {
            id: true,
            nombre: true,
            apellido: true,
            dni: true,
            inscripciones: {
              where: { activo: true },
              select: { disciplina: { select: { id: true, nombre: true } } },
            },
          },
        },
      },
    });
  }

  /**
   * TASK-60 — Aprueba o rechaza un documento que subió el titular y le avisa
   * por email. El delegado solo revisa los de sus disciplinas.
   */
  async revisar(
    id: number,
    user: AuthenticatedUser,
    decision: { aprobar: true } | { aprobar: false; motivo: string },
  ) {
    const doc = await this.prisma.documentacion.findUnique({
      where: { id },
      include: { persona: { select: { id: true, usuario: { select: { id: true } } } } },
    });
    if (!doc) {
      throw new NotFoundException('Documento no encontrado');
    }
    if (doc.estadoRevision !== 'PENDIENTE_REVISION') {
      throw new ConflictException('El documento ya fue revisado.');
    }
    const disciplinas = await this.disciplinasACargo(user);
    if (disciplinas) {
      const aCargo = await this.prisma.inscripcion.count({
        where: { personaId: doc.personaId, activo: true, disciplinaId: { in: disciplinas } },
      });
      if (!aCargo) {
        throw new ForbiddenException('El documento es de un participante de otra disciplina.');
      }
    }

    const estadoRevision = decision.aprobar ? 'APROBADO' : 'RECHAZADO';
    const motivo = decision.aprobar ? null : decision.motivo.trim();
    const actualizado = await this.prisma.documentacion.update({
      where: { id },
      data: {
        estadoRevision,
        motivoRechazo: motivo,
        revisadoPorId: user.id,
        revisadoEn: new Date(),
      },
    });

    await this.auditoria.registrar({
      accion: 'EDITAR',
      entidad: 'Documentacion',
      idEntidad: id,
      responsableId: user.id,
      detalle: decision.aprobar
        ? `Documento "${doc.tipo}" aprobado`
        : `Documento "${doc.tipo}" rechazado: ${motivo}`,
    });

    const titularId = doc.persona.usuario?.id;
    if (titularId) {
      try {
        await this.notificaciones.notificar({
          plantilla: this.plantillaRevision,
          destinatarios: [titularId],
          referencias: [`documentacion-${id}-${estadoRevision}`],
          datos: { resultado: estadoRevision, documento: doc.tipo, motivo },
        });
      } catch (error) {
        this.logger.error(
          `No se pudo avisar la revisión del documento ${id}: ${(error as Error).message}`,
        );
      }
    }

    return actualizado;
  }

  /**
   * DT-28: Valida que el usuario tenga permisos para consultar la documentación
   * de una persona: ADMIN, DELEGADO y COLABORADOR tienen acceso global; el participante
   * solo puede consultar la suya propia.
   */
  async validarAccesoPersona(personaId: number, user: AuthenticatedUser) {
    const esStaff = user.roles?.some((rol) => ROLES_STAFF.includes(rol));
    if (esStaff) {
      return;
    }

    const usuario = await this.prisma.usuario.findUnique({
      where: { id: user.id },
      select: { personaId: true },
    });

    if (!usuario?.personaId || usuario.personaId !== personaId) {
      throw new ForbiddenException('No tenés permisos suficientes para esta operación');
    }
  }

  /** Obtiene la personaId asociada a un usuario del sistema (autoservicio). */
  async obtenerPersonaIdDeUsuario(usuarioId: number): Promise<number> {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: { personaId: true },
    });
    if (!usuario?.personaId) {
      throw new NotFoundException('No se encontró una ficha de persona asociada al usuario');
    }
    return usuario.personaId;
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

  /** Devuelve la ruta absoluta del archivo adjunto para descargarlo. */
  async obtenerArchivo(id: number, user?: AuthenticatedUser) {
    const doc = await this.prisma.documentacion.findUnique({ where: { id } });
    if (!doc || !doc.archivoRuta) {
      throw new NotFoundException('El documento no tiene un archivo adjunto');
    }

    if (user) {
      const esStaff = user.roles?.some((rol) => ROLES_STAFF.includes(rol));
      if (!esStaff) {
        const usuario = await this.prisma.usuario.findUnique({
          where: { id: user.id },
          select: { personaId: true },
        });
        if (!usuario?.personaId || usuario.personaId !== doc.personaId) {
          throw new ForbiddenException('No tenés permisos suficientes para esta operación');
        }
      }
    }

    const rutaAbsoluta = join(getStorageDir(), doc.archivoRuta);
    if (!existsSync(rutaAbsoluta)) {
      throw new NotFoundException('El archivo no se encuentra en el servidor');
    }
    return {
      rutaAbsoluta,
      nombre: doc.archivoNombre ?? doc.archivoRuta,
      mimeType: doc.mimeType ?? 'application/octet-stream',
    };
  }
}
