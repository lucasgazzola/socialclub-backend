import {
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { EstadoSolicitudInscripcion, Prisma, TipoDocumentacionDisciplina } from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInscripcionDto } from './dto/create-inscripcion.dto';
import { UpdateInscripcionDto } from './dto/update-inscripcion.dto';
import { SolicitarInscripcionDto } from './dto/solicitar-inscripcion.dto';
import { FindSolicitudesInscripcionQueryDto } from './dto/find-solicitudes-inscripcion-query.dto';
import { RechazarSolicitudInscripcionDto } from './dto/rechazar-solicitud-inscripcion.dto';
import { CrearHabilitacionExcepcionalDto } from './dto/crear-habilitacion-excepcional.dto';
import { SubirSolicitudDocumentacionDto } from './dto/subir-solicitud-documentacion.dto';
import {
  EstadoDocumentalFiltro,
  EstadoInscripcionFiltro,
  FindParticipantesQueryDto,
} from './dto/find-participantes-query.dto';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { EstadoDocumentalService } from '../documentacion/estado-documental.service';
import { estadoGeneral } from '../documentacion/estado-documental';
import {
  motivosDeIncumplimiento,
  restriccionesEfectivas,
  type Restricciones,
} from '../disciplinas/restricciones';
import { ETIQUETA_TIPO_DOCUMENTO, requiereVencimiento } from '../disciplinas/requerimientos-doc';
import { periodoActual } from '../cuotas/cuotas.service';
import { tarifaVigente, montoACobrar } from '../cuotas/tarifas';
import { abrirPeriodo, cerrarPeriodos } from './periodos-inscripcion';
import {
  EnlaceEmitido,
  VerificacionEmailService,
} from '../verificacion-email/verificacion-email.service';
import type { ArchivoSubido } from '../documentacion/storage.config';

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
  | 'fechaBaja'
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
    private readonly estadoDocumental: EstadoDocumentalService,
    private readonly verificacion: VerificacionEmailService,
  ) {}

  /**
   * DT-39 (US-05/06): el participante tiene que cumplir las restricciones de
   * género y edad de la categoría o, si no las define, de la disciplina. La
   * edad es la que cumple en el año (por año de nacimiento).
   */
  private validarRestricciones(
    participante: Parameters<typeof motivosDeIncumplimiento>[0],
    disciplina: Restricciones & { nombre: string },
    categoria: (Restricciones & { nombre: string }) | null | undefined,
  ) {
    const motivos = motivosDeIncumplimiento(
      participante,
      restriccionesEfectivas(disciplina, categoria),
    );
    if (motivos.length) {
      const destino = categoria ? `${disciplina.nombre} · ${categoria.nombre}` : disciplina.nombre;
      throw new BadRequestException(
        `El participante no cumple las restricciones de ${destino}. ${motivos.join(' ')}`,
      );
    }
  }

  /**
   * El email es único por persona: si ya lo tiene OTRA persona se rechaza con
   * un mensaje claro (antes la base cortaba el alta y el mensaje hablaba del DNI).
   */
  private async validarEmailDisponible(
    email: string | undefined,
    propia: { id?: number; dni?: string | null },
  ) {
    if (!email) return;
    const conEseEmail = await this.prisma.persona.findUnique({ where: { email } });
    const esLaMisma =
      !!conEseEmail &&
      ((propia.id !== undefined && conEseEmail.id === propia.id) ||
        (!!propia.dni && conEseEmail.dni === propia.dni));
    if (conEseEmail && !esLaMisma) {
      throw new ConflictException('El email ya está registrado por otra persona');
    }
  }

  /** Traduce un choque de unicidad de la base al campo que lo provocó. */
  private mensajeDuplicado(error: PrismaClientKnownRequestError, porDefecto: string) {
    const campos = JSON.stringify(error.meta?.target ?? '');
    if (campos.includes('email')) return 'El email ya está registrado por otra persona';
    if (campos.includes('dni')) return 'Ya existe una persona registrada con ese DNI';
    return porDefecto;
  }

  /** US-05/25/27: estado documental de una inscripción recién creada o consultada. */
  private async estadoDocumentalDe(personaId: number, inscripcionId: number) {
    const resumen = await this.estadoDocumental.porPersona(personaId);
    return resumen?.inscripciones?.find((i) => i.inscripcionId === inscripcionId) ?? null;
  }

  /**
   * US-05: requisitos de una inscripción antes de confirmarla — restricciones
   * que rigen y documentación exigida (con lo que la persona ya presentó).
   */
  async requisitos(disciplinaId: number, categoriaDisciplinaId?: number, personaId?: number) {
    const disciplina = await this.prisma.disciplina.findUnique({
      where: { id: disciplinaId },
      include: { categorias: true },
    });
    if (!disciplina) throw new NotFoundException('Disciplina no encontrada');
    const categoria = categoriaDisciplinaId
      ? disciplina.categorias.find((c) => c.id === categoriaDisciplinaId)
      : undefined;
    if (categoriaDisciplinaId && !categoria) {
      throw new NotFoundException('La categoría no pertenece a esta disciplina');
    }
    const documentacion = await this.estadoDocumental.previsualizar(
      disciplinaId,
      categoria?.id ?? null,
      personaId ?? null,
    );
    return { restricciones: restriccionesEfectivas(disciplina, categoria), documentacion };
  }

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

    // US-50: una categoría dada de baja no se ofrece para nuevas inscripciones,
    // así que solo las activas obligan a elegir categoría.
    const tieneCategorias = disciplina.categorias.some((c) => c.activo);

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

    await this.validarEmailDisponible(dto.email, { id: dto.personaId, dni: dto.dni });

    // DT-54: enlace para el participante nuevo con email, que se envía al confirmar.
    let enlace: EnlaceEmitido | null = null;

    try {
      const resultado = await this.prisma.$transaction(async (tx) => {
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
                genero: dto.genero,
                email: dto.email,
                telefono: dto.telefono,
              },
            });

            // DT-54: el participante nuevo con email recibe un enlace para
            // activar su cuenta (sin rol: verá sus inscripciones).
            if (persona.email) {
              enlace = await this.verificacion.crearCuentaPendiente(tx, {
                personaId: persona.id,
                email: persona.email,
                nombre: persona.nombre,
                apellido: persona.apellido,
                responsableId,
              });
            }
          }
        }

        // Si la persona ya existía, solo se completan los datos que le faltan
        // (fecha de nacimiento y género, que piden las restricciones): nunca se
        // pisan datos cargados.
        const faltantes = {
          ...(!persona.fechaNacimiento && dto.fechaNacimiento
            ? { fechaNacimiento: new Date(dto.fechaNacimiento) }
            : {}),
          ...(!persona.genero && dto.genero ? { genero: dto.genero } : {}),
        };
        if (Object.keys(faltantes).length) {
          persona = await tx.persona.update({ where: { id: persona.id }, data: faltantes });
        }

        // US-07: un participante dado de baja no puede ser inscripto en ninguna
        // disciplina. Se compara con `=== false` (no con `!persona.activo`): los
        // mocks y registros viejos pueden no traer el campo, y `undefined` no
        // significa "dado de baja".
        if (persona.activo === false) {
          throw new BadRequestException(
            'El participante está dado de baja: hay que reactivarlo antes de inscribirlo',
          );
        }

        this.validarRestricciones(
          { genero: persona.genero ?? null, fechaNacimiento: persona.fechaNacimiento ?? null },
          disciplina,
          disciplina.categorias.find((c) => c.id === dto.categoriaDisciplinaId),
        );

        await this.exigirDocumentosAlInscribir(
          tx,
          persona.id,
          dto.disciplinaId,
          dto.categoriaDisciplinaId,
          dto.documentos,
        );

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

        let inscripcionFinal;
        if (inscripcionExistente) {
          const ahora = new Date();
          const reactivada = await tx.inscripcion.update({
            where: { id: inscripcionExistente.id },
            data: {
              activo: true,
              fechaInscripcion: ahora,
              fechaBaja: null,
              requisitosDesde: null,
              categoriaDisciplinaId: dto.categoriaDisciplinaId ?? null,
            },
          });
          // DT-41: la reinscripción abre un período nuevo; los anteriores
          // conservan su deuda.
          await abrirPeriodo(tx, reactivada.id, ahora);

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

          inscripcionFinal = reactivada;
        } else {
          const inscripcion = await tx.inscripcion.create({
            data: {
              personaId: persona.id,
              disciplinaId: dto.disciplinaId,
              categoriaDisciplinaId: dto.categoriaDisciplinaId ?? null,
            },
          });
          await abrirPeriodo(tx, inscripcion.id, inscripcion.fechaInscripcion ?? new Date());

          await tx.registroAuditoria.create({
            data: {
              accion: 'CREAR',
              entidad: 'Inscripcion',
              idEntidad: inscripcion.id,
              detalle: `Inscripción de ${persona.apellido} ${persona.nombre}, ${persona.dni} en la disciplina ${disciplina.nombre}`,
              responsableId,
            },
          });

          inscripcionFinal = inscripcion;
        }

        // US-05 Criterio 7: adjuntar documentos faltantes en la misma operación de alta
        if (dto.documentos && dto.documentos.length > 0) {
          const requisitos = tx.disciplinaRequerimientoDoc
            ? await tx.disciplinaRequerimientoDoc.findMany({
                where: {
                  disciplinaId: dto.disciplinaId,
                  OR: [
                    { categoriaDisciplinaId: null },
                    ...(dto.categoriaDisciplinaId
                      ? [{ categoriaDisciplinaId: dto.categoriaDisciplinaId }]
                      : []),
                  ],
                },
              })
            : [];
          const tiposExigidos = new Set(requisitos.map((r) => r.tipoDocumento));

          const hoy = new Date();
          hoy.setHours(0, 0, 0, 0);

          for (const doc of dto.documentos) {
            if (tiposExigidos.size > 0 && !tiposExigidos.has(doc.tipoDocumento)) {
              throw new BadRequestException(
                `Ninguna disciplina o categoría de la inscripción exige «${ETIQUETA_TIPO_DOCUMENTO[doc.tipoDocumento] ?? doc.tipoDocumento}».`,
              );
            }

            const rawFecha = doc.fechaVencimiento?.trim();
            if (!rawFecha && requiereVencimiento(doc.tipoDocumento)) {
              throw new BadRequestException('La fecha de vencimiento es obligatoria.');
            }

            let fechaVencimiento: Date | null = null;
            if (rawFecha) {
              const soloFecha = /^(\d{4})-(\d{2})-(\d{2})/.exec(rawFecha);
              fechaVencimiento = soloFecha
                ? new Date(Number(soloFecha[1]), Number(soloFecha[2]) - 1, Number(soloFecha[3]))
                : new Date(rawFecha);

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

            if (tx.documentacion) {
              const docCreado = await tx.documentacion.create({
                data: {
                  tipoDocumento: doc.tipoDocumento,
                  tipo:
                    doc.tipo?.trim() ||
                    ETIQUETA_TIPO_DOCUMENTO[doc.tipoDocumento] ||
                    doc.tipoDocumento,
                  fechaVencimiento,
                  personaId: persona.id,
                  archivoNombre: doc.archivoNombre ?? null,
                  archivoRuta: doc.archivoRuta ?? null,
                  mimeType: doc.mimeType ?? null,
                  tamano: doc.tamano ?? null,
                },
              });

              await this.auditoria.registrar(
                {
                  accion: 'CREAR',
                  entidad: 'Documentacion',
                  idEntidad: docCreado.id,
                  detalle: `Documento "${docCreado.tipo}" cargado para la persona id=${persona.id}`,
                  responsableId,
                },
                tx,
              );
            }
          }
        }

        // US-05 Criterio 10: calcular la cuota generada correspondiente a esa disciplina
        const periodo = periodoActual();
        const rawTarifas = tx.configuracionCuotaDeportiva
          ? await tx.configuracionCuotaDeportiva.findMany({
              where: { disciplinaId: dto.disciplinaId, activo: true },
            })
          : [];
        const tarifas = Array.isArray(rawTarifas) ? rawTarifas : [];
        const membresiaActiva = tx.membresia
          ? await tx.membresia.findFirst({
              where: { personaId: persona.id, activo: true },
            })
          : null;

        const tarifa = tarifaVigente(
          tarifas.map((t) => ({
            id: t.id,
            categoriaDisciplinaId: t.categoriaDisciplinaId,
            periodoAplicacion: t.periodoAplicacion,
            monto: Number(t.monto),
            descuentoSocioPorcentaje: t.descuentoSocioPorcentaje,
            activo: t.activo,
          })),
          dto.categoriaDisciplinaId ?? null,
          periodo,
        );
        const esSocio = !!membresiaActiva;
        const cuotaGenerada = tarifa
          ? {
              periodo,
              monto: montoACobrar(tarifa, esSocio),
              montoTarifa: Number(tarifa.monto),
              descuentoSocioPorcentaje: esSocio ? tarifa.descuentoSocioPorcentaje : 0,
              esSocio,
              sinTarifa: false,
            }
          : {
              periodo,
              monto: null,
              montoTarifa: null,
              descuentoSocioPorcentaje: 0,
              esSocio,
              sinTarifa: true,
            };

        return { persona, inscripcion: inscripcionFinal, cuotaGenerada };
      });
      await this.verificacion.enviar(enlace, responsableId);
      // US-05: al confirmar se informa qué documentación falta y hasta cuándo, y la cuota generada.
      return {
        ...resultado,
        estadoDocumental: await this.estadoDocumentalDe(
          resultado.persona.id,
          resultado.inscripcion.id,
        ),
      };
    } catch (error) {
      // Si dos requests concurrentes pasan la verificación al mismo tiempo, el
      // constraint único de la DB corta el segundo insert acá.
      if (error instanceof PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(
          this.mensajeDuplicado(error, 'El participante ya está inscripto en esta disciplina'),
        );
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

    const tieneCategorias = disciplinaDestino.categorias.some((c) => c.activo);
    const disciplinaCambio = disciplinaIdDestino !== inscripcionActual.disciplinaId;

    let categoriaIdDestino: number | null;
    if ('categoriaDisciplinaId' in dto) {
      categoriaIdDestino = dto.categoriaDisciplinaId ?? null;
    } else if (disciplinaCambio) {
      categoriaIdDestino = null;
    } else {
      categoriaIdDestino = inscripcionActual.categoriaDisciplinaId ?? null;
    }

    // US-50: la inscripción conserva su categoría aunque se haya dado de baja;
    // solo se exige una categoría activa cuando se cambia.
    const categoriaCambio =
      disciplinaCambio || categoriaIdDestino !== (inscripcionActual.categoriaDisciplinaId ?? null);

    if (tieneCategorias && categoriaIdDestino === null && categoriaCambio) {
      throw new BadRequestException('Debe seleccionar una categoría para esta disciplina');
    }

    if (categoriaIdDestino && categoriaCambio) {
      const categoriaValida = disciplinaDestino.categorias.some(
        (c) => c.id === categoriaIdDestino && c.activo,
      );
      if (!categoriaValida) {
        throw new BadRequestException(
          'La categoría indicada no pertenece a esta disciplina o no está activa',
        );
      }
    }

    // DT-39: se revalidan las restricciones si cambia algo que las afecta.
    if (categoriaCambio || dto.fechaNacimiento !== undefined || dto.genero !== undefined) {
      this.validarRestricciones(
        {
          genero: dto.genero ?? inscripcionActual.persona.genero ?? null,
          fechaNacimiento: dto.fechaNacimiento
            ? new Date(dto.fechaNacimiento)
            : (inscripcionActual.persona.fechaNacimiento ?? null),
        },
        disciplinaDestino,
        disciplinaDestino.categorias.find((c) => c.id === categoriaIdDestino),
      );
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
    if (dto.email && dto.email !== inscripcionActual.persona.email) {
      await this.validarEmailDisponible(dto.email, { id: inscripcionActual.personaId });
    }

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
            genero: dto.genero ?? inscripcionActual.persona.genero,
            email: dto.email ?? inscripcionActual.persona.email,
            telefono: dto.telefono ?? inscripcionActual.persona.telefono,
          },
        });

        // Traslado a una disciplina donde el participante ya tuvo una
        // inscripción: se reactiva esa fila y la actual queda dada de baja. La
        // inscripción resultante cambia de id.
        const ahora = new Date();
        const inscripcionActualizada = inscripcionInactivaEnDestino
          ? await tx.inscripcion.update({
              where: { id: inscripcionInactivaEnDestino.id },
              data: {
                activo: true,
                fechaInscripcion: ahora,
                fechaBaja: null,
                requisitosDesde: null,
                categoriaDisciplinaId: categoriaIdDestino,
              },
              include: { persona: true, disciplina: true, categoriaDisciplina: true },
            })
          : await tx.inscripcion.update({
              where: { id },
              data: {
                disciplinaId: disciplinaIdDestino,
                categoriaDisciplinaId: categoriaIdDestino,
                // US-06: al cambiar de categoría/disciplina, el plazo para la
                // documentación nueva corre desde hoy.
                ...(categoriaCambio ? { requisitosDesde: new Date() } : {}),
              },
              include: { persona: true, disciplina: true, categoriaDisciplina: true },
            });

        if (inscripcionInactivaEnDestino) {
          await tx.inscripcion.update({ where: { id }, data: { activo: false, fechaBaja: ahora } });
          // DT-41: se cierra el período de la disciplina de origen y se abre
          // uno nuevo en la de destino.
          await cerrarPeriodos(tx, [id], ahora);
          await abrirPeriodo(tx, inscripcionInactivaEnDestino.id, ahora);

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
        throw new ConflictException(
          this.mensajeDuplicado(error, 'Ya existe un participante con ese DNI en esta disciplina'),
        );
      }
      throw error;
    }
  }

  /**
   * US-07: Dar de baja a un participante.
   *
   * El participante tiene un estado propio en la base (`Persona.activo`):
   * Inactivo = dado de baja por el delegado. No se confunde con la vigencia
   * de cada inscripción (`Inscripcion.activo`, que US-08 expone como
   * INSCRIPTO/BAJA): la baja del participante desactiva su estado y, en la
   * misma transacción, da de baja —lógicamente— todas sus inscripciones
   * vigentes. Al quedar sin ningún estado ni disciplina activos, el
   * participante queda bloqueado en todas las que tenía y fuera de la
   * generación de cuotas asociadas (que hoy no existe en el dominio, pero que
   * tendrá que partir de las inscripciones vigentes).
   *
   * Las filas no se borran: el unique (personaId, disciplinaId) las necesita
   * para poder reinscribir a la persona más adelante (mismo criterio que
   * `remove` y que `usuarios.create` reutilizando una Persona existente). Y la
   * única manera de que un participante inactivo vuelva a participar es
   * reactivarlo explícitamente (`activarParticipante`): inscribir a alguien
   * dado de baja se rechaza con un mensaje claro.
   *
   * Todo ocurre en una transacción y con auditoría (RNF07): o se desactiva el
   * estado, se dan de baja todas las disciplinas y queda el rastro de quién lo
   * hizo, o no cambia nada.
   */
  async darDeBajaParticipante(personaId: number, responsableId: number) {
    const persona = await this.prisma.persona.findUnique({ where: { id: personaId } });
    if (!persona) {
      throw new NotFoundException('Participante no encontrado');
    }

    // Comparación estricta: `undefined` (mocks o registros sin el campo) no es
    // "dado de baja".
    if (persona.activo === false) {
      throw new BadRequestException('El participante ya está dado de baja');
    }

    const inscripcionesActivas = await this.prisma.inscripcion.findMany({
      where: { personaId, activo: true },
      include: { disciplina: true },
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.persona.update({ where: { id: personaId }, data: { activo: false } });

      const ahora = new Date();
      await tx.inscripcion.updateMany({
        where: { personaId, activo: true },
        data: { activo: false, fechaBaja: ahora },
      });
      await cerrarPeriodos(
        tx,
        inscripcionesActivas.map((i) => i.id),
        ahora,
      );

      // Una fila de auditoría por disciplina: la trazabilidad tiene que
      // permitir ver qué inscripción se dio de baja, no sólo que hubo una.
      for (const inscripcion of inscripcionesActivas) {
        await this.auditoria.registrar(
          {
            accion: 'BAJA',
            entidad: 'Inscripcion',
            idEntidad: inscripcion.id,
            detalle: `Baja de la inscripción de ${persona.apellido} ${persona.nombre}, DNI ${persona.dni} en la disciplina ${inscripcion.disciplina.nombre}`,
            responsableId,
          },
          tx,
        );
      }

      await this.auditoria.registrar(
        {
          accion: 'BAJA',
          entidad: 'Persona',
          idEntidad: personaId,
          detalle: `Baja del participante ${persona.apellido} ${persona.nombre}, DNI ${persona.dni}: ${inscripcionesActivas.length} disciplina(s) dada(s) de baja`,
          responsableId,
        },
        tx,
      );
    });

    return {
      personaId,
      activo: false,
      disciplinasDadasDeBaja: inscripcionesActivas.length,
      disciplinas: inscripcionesActivas.map((inscripcion) => ({
        inscripcionId: inscripcion.id,
        disciplinaId: inscripcion.disciplinaId,
        disciplina: inscripcion.disciplina.nombre,
      })),
    };
  }

  /**
   * US-07: Reactivar a un participante dado de baja.
   *
   * Es la única vía para que un participante inactivo vuelva a participar:
   * inscribirlo mientras está dado de baja se rechaza (ver `create`). Solo
   * cambia el estado del participante y lo audita; las disciplinas no se
   * re-inscriben solas: cada nueva inscripción tiene su propio flujo (y su
   * propia auditoría REACTIVAR de la fila de inscripción).
   */
  async activarParticipante(personaId: number, responsableId: number) {
    const persona = await this.prisma.persona.findUnique({ where: { id: personaId } });
    if (!persona) {
      throw new NotFoundException('Participante no encontrado');
    }

    if (persona.activo !== false) {
      throw new BadRequestException('El participante ya está activo');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.persona.update({ where: { id: personaId }, data: { activo: true } });

      await this.auditoria.registrar(
        {
          accion: 'REACTIVAR',
          entidad: 'Persona',
          idEntidad: personaId,
          detalle: `Reactivación del participante ${persona.apellido} ${persona.nombre}, DNI ${persona.dni}`,
          responsableId,
        },
        tx,
      );
    });

    return { personaId, activo: true };
  }

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
      fechaBaja: inscripcion.fechaBaja ?? null,
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
  async findAll(
    query: FindParticipantesQueryDto = { pagina: 1, porPagina: 10 },
    usuario?: { id: number; roles: readonly string[] },
  ) {
    const {
      busqueda,
      disciplinaId,
      estado,
      estadoDocumental,
      pagina,
      porPagina,
      ordenarPor,
      orden,
    } = query;

    const direccion: 'asc' | 'desc' = orden?.toLowerCase() === 'desc' ? 'desc' : 'asc';
    const campoOrden = ordenarPor?.toLowerCase();
    // Nombre y DNI se ordenan en la base. El estado documental se calcula después
    // de leer, así que el orden por defecto (pendientes primero) y ese filtro
    // se resuelven sobre el conjunto completo y recién ahí se pagina.
    const ordenaEnBase =
      campoOrden === 'dni' ||
      campoOrden === 'fecha' ||
      campoOrden === 'creadoen' ||
      campoOrden === 'nombre' ||
      campoOrden === 'apellido' ||
      campoOrden === 'participante';
    const paginarEnMemoria = !ordenaEnBase || Boolean(estadoDocumental);
    let orderBy: Prisma.PersonaOrderByWithRelationInput | Prisma.PersonaOrderByWithRelationInput[];

    if (!ordenarPor) {
      orderBy = [{ apellido: 'asc' }, { nombre: 'asc' }];
    } else {
      switch (ordenarPor.toLowerCase()) {
        case 'dni':
          orderBy = { dni: direccion };
          break;
        case 'fecha':
        case 'creadoen':
          orderBy = { creadoEn: direccion };
          break;
        case 'nombre':
        case 'apellido':
        case 'participante':
          orderBy = [{ apellido: direccion }, { nombre: direccion }];
          break;
        default:
          orderBy = [{ apellido: 'asc' }, { nombre: 'asc' }];
          break;
      }
    }

    const filtrosBase: Prisma.PersonaWhereInput[] = [
      // Solo personas que participan en al menos una disciplina.
      { inscripciones: { some: {} } },
    ];

    if (busqueda && busqueda.trim()) {
      const termino = busqueda.trim();
      filtrosBase.push({
        OR: [
          { nombre: { contains: termino, mode: 'insensitive' } },
          { apellido: { contains: termino, mode: 'insensitive' } },
          { dni: { contains: termino, mode: 'insensitive' } },
          { dni: { equals: termino } },
        ],
      });
    }

    if (disciplinaId) {
      filtrosBase.push({ inscripciones: { some: { disciplinaId } } });
    }

    // H07: el delegado ve solo las personas de sus disciplinas. ADMIN y
    // COLABORADOR siguen viendo el padrón completo (DT-42).
    const disciplinasDelegado = await this.disciplinasDeDelegado(usuario);
    if (disciplinasDelegado) {
      const pedidaAjena = disciplinaId != null && !disciplinasDelegado.includes(disciplinaId);
      if (disciplinasDelegado.length === 0 || pedidaAjena) {
        filtrosBase.push({ id: -1 });
      } else if (disciplinaId == null) {
        filtrosBase.push({
          inscripciones: { some: { disciplinaId: { in: disciplinasDelegado } } },
        });
      }
    }

    // DT-61: para el delegado, «inscripto» y «baja» se miden en sus disciplinas.
    const activaVisible: Prisma.InscripcionWhereInput = disciplinasDelegado
      ? { activo: true, disciplinaId: { in: disciplinasDelegado } }
      : { activo: true };
    const whereBase: Prisma.PersonaWhereInput = { AND: filtrosBase };
    const whereInscriptos: Prisma.PersonaWhereInput = {
      AND: [...filtrosBase, { inscripciones: { some: activaVisible } }],
    };
    const whereBaja: Prisma.PersonaWhereInput = {
      AND: [...filtrosBase, { inscripciones: { none: activaVisible } }],
    };

    let where: Prisma.PersonaWhereInput = whereBase;
    if (estado === EstadoInscripcionFiltro.INSCRIPTO) {
      where = whereInscriptos;
    } else if (estado === EstadoInscripcionFiltro.BAJA) {
      where = whereBaja;
    }

    const [items, total, totalTodos, totalInscriptos, totalBaja] = await this.prisma.$transaction([
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
        orderBy,
        ...(paginarEnMemoria ? {} : { skip: (pagina - 1) * porPagina, take: porPagina }),
      }),
      this.prisma.persona.count({ where }),
      this.prisma.persona.count({ where: whereBase }),
      this.prisma.persona.count({ where: whereInscriptos }),
      this.prisma.persona.count({ where: whereBaja }),
    ]);

    const estados = await this.estadoDocumental.porPersonas(items.map((p) => p.id));
    const itemsVisibles = disciplinasDelegado
      ? items.map((p) => ({
          ...p,
          inscripciones: p.inscripciones.filter((i) =>
            disciplinasDelegado.includes(i.disciplinaId),
          ),
        }))
      : items;
    let resultadoItems = itemsVisibles.map((p) => {
      const fila = this.aParticipanteAgrupado(p);
      const resumen = estados.get(p.id);
      const disciplinas = fila.disciplinas.map((d) => {
        const detalle = resumen?.inscripciones.find((i) => i.inscripcionId === d.inscripcionId);
        return {
          ...d,
          estadoDocumental: detalle?.estado ?? null,
          motivosDocumentacion: detalle?.motivos ?? [],
        };
      });
      return {
        ...fila,
        // US-08/25: estado documental del participante (el peor de sus inscripciones).
        // DT-61: el delegado lo ve calculado solo con las disciplinas que tiene a cargo.
        estadoDocumental: disciplinasDelegado
          ? estadoGeneral(
              disciplinas
                .map((d) => d.estadoDocumental)
                .filter((e): e is NonNullable<typeof e> => e != null),
            )
          : (resumen?.estado ?? null),
        disciplinas,
      };
    });

    let totalPagina = total;
    if (paginarEnMemoria) {
      const ids = items.map((p) => p.id);
      // DT-61: para el delegado cuentan solo los tipos que exigen sus disciplinas.
      const tiposDelegado = disciplinasDelegado
        ? [
            ...new Set(
              (
                await this.prisma.disciplinaRequerimientoDoc.findMany({
                  where: { disciplinaId: { in: disciplinasDelegado } },
                  select: { tipoDocumento: true },
                })
              ).map((r) => r.tipoDocumento),
            ),
          ]
        : null;
      const enRevision = new Set(
        ids.length && (!tiposDelegado || tiposDelegado.length)
          ? (
              await this.prisma.documentacion.findMany({
                where: {
                  personaId: { in: ids },
                  estadoRevision: 'PENDIENTE_REVISION',
                  ...(tiposDelegado ? { tipoDocumento: { in: tiposDelegado } } : {}),
                },
                select: { personaId: true },
                distinct: ['personaId'],
              })
            ).map((doc) => doc.personaId)
          : [],
      );

      if (estadoDocumental === EstadoDocumentalFiltro.PENDIENTE_APROBACION) {
        resultadoItems = resultadoItems.filter((item) => enRevision.has(item.personaId));
      } else if (estadoDocumental) {
        resultadoItems = resultadoItems.filter(
          (item) => item.estadoDocumental === estadoDocumental,
        );
      }

      const porNombre = (a: (typeof resultadoItems)[number], b: (typeof resultadoItems)[number]) =>
        `${a.persona.apellido} ${a.persona.nombre}`.localeCompare(
          `${b.persona.apellido} ${b.persona.nombre}`,
          'es',
          { sensitivity: 'base' },
        );
      const prioridad = (item: (typeof resultadoItems)[number]) => {
        if (enRevision.has(item.personaId)) return 0;
        if (item.estadoDocumental === 'PENDIENTE') return 1;
        if (item.estadoDocumental === 'BLOQUEADO') return 2;
        if (item.estadoDocumental === 'HABILITADO') return 3;
        return 4;
      };

      if (campoOrden === 'disciplinas') {
        resultadoItems.sort((a, b) => {
          const diff = (a.cantidadDisciplinas ?? 0) - (b.cantidadDisciplinas ?? 0);
          return direccion === 'asc' ? diff : -diff;
        });
      } else if (campoOrden === 'estado') {
        resultadoItems.sort((a, b) => {
          const diff = (a.estado === 'INSCRIPTO' ? 1 : 0) - (b.estado === 'INSCRIPTO' ? 1 : 0);
          return direccion === 'asc' ? diff : -diff;
        });
      } else if (campoOrden === 'documentacion') {
        resultadoItems.sort((a, b) => {
          const diff = (a.estadoDocumental ?? '').localeCompare(b.estadoDocumental ?? '', 'es', {
            sensitivity: 'base',
          });
          return direccion === 'asc' ? diff : -diff;
        });
      } else if (!ordenaEnBase) {
        resultadoItems.sort((a, b) => prioridad(a) - prioridad(b) || porNombre(a, b));
      }

      totalPagina = resultadoItems.length;
      const inicio = (pagina - 1) * porPagina;
      resultadoItems = resultadoItems.slice(inicio, inicio + porPagina);
    }

    return {
      items: resultadoItems,
      total: totalPagina,
      pagina,
      porPagina,
      counts: {
        todos: totalTodos,
        inscriptos: totalInscriptos,
        baja: totalBaja,
      },
    };
  }

  /** DT-61: un delegado solo consulta inscripciones de las disciplinas que tiene a cargo. */
  private async exigirDisciplinaACargo(
    usuario: { id: number; roles: readonly string[] } | undefined,
    disciplinaId: number,
  ) {
    const disciplinasDelegado = await this.disciplinasDeDelegado(usuario);
    if (disciplinasDelegado && !disciplinasDelegado.includes(disciplinaId)) {
      throw new ForbiddenException('La inscripción es de una disciplina que no tenés a cargo');
    }
  }

  /**
   * Disciplinas a cargo de un delegado. `null` si el usuario ve todo el padrón
   * (sin usuario en los tests, o con rol ADMIN o COLABORADOR).
   */
  private async disciplinasDeDelegado(usuario?: {
    id: number;
    roles: readonly string[];
  }): Promise<number[] | null> {
    if (!usuario) return null;
    if (usuario.roles.includes('ADMIN') || usuario.roles.includes('COLABORADOR')) return null;
    if (!usuario.roles.includes('DELEGADO')) return null;
    const asignadas = await this.prisma.delegadoDisciplina.findMany({
      where: { usuarioId: usuario.id },
      select: { disciplinaId: true },
    });
    return asignadas.map((a) => a.disciplinaId);
  }

  /**
   * Inscripciones de una persona. Por defecto devuelve solo las vigentes
   * (incluirBajas = false). La página de edición de participante pide
   * incluirBajas = true para poder cargar y editar a un participante dado
   * de baja (US-07): sigue siendo participante aunque no tenga disciplinas
   * activas.
   */
  async findByPersonaId(
    personaId: number,
    incluirBajas = false,
    usuario?: { id: number; roles: readonly string[] },
  ) {
    // DT-61: el delegado ve solo las inscripciones de sus disciplinas.
    const disciplinasDelegado = await this.disciplinasDeDelegado(usuario);
    return this.prisma.inscripcion.findMany({
      where: {
        personaId,
        ...(incluirBajas ? {} : { activo: true }),
        ...(disciplinasDelegado ? { disciplinaId: { in: disciplinasDelegado } } : {}),
      },
      include: {
        persona: true,
        disciplina: true,
        categoriaDisciplina: true,
      },
      orderBy: { fechaInscripcion: 'desc' },
    });
  }

  async findOne(id: number, usuario?: { id: number; roles: readonly string[] }) {
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
    await this.exigirDisciplinaACargo(usuario, inscripcion.disciplinaId);
    const estadoDocumental = inscripcion.activo
      ? await this.estadoDocumentalDe(inscripcion.personaId, inscripcion.id)
      : null;

    return {
      ...inscripcion,
      estadoDocumental,
    };
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
      const ahora = new Date();
      const dadaDeBaja = await tx.inscripcion.update({
        where: { id },
        data: { activo: false, fechaBaja: ahora },
        include: { persona: true, disciplina: true, categoriaDisciplina: true },
      });
      await cerrarPeriodos(tx, [id], ahora);

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

  /**
   * US-28: Habilitar participante con documentación vencida o faltante (levantamiento manual excepcional).
   * Registra el motivo justificado y la vigencia en días otorgada por un administrador.
   */
  async habilitarExcepcional(
    inscripcionId: number,
    dto: CrearHabilitacionExcepcionalDto,
    responsableId: number,
  ) {
    const inscripcion = await this.prisma.inscripcion.findUnique({
      where: { id: inscripcionId },
      include: {
        persona: true,
        disciplina: true,
        categoriaDisciplina: true,
      },
    });

    if (!inscripcion) {
      throw new NotFoundException('Inscripción no encontrada');
    }

    if (!inscripcion.activo) {
      throw new BadRequestException(
        'La inscripción está dada de baja: no puede recibir habilitaciones excepcionales',
      );
    }

    if (!inscripcion.persona.activo) {
      throw new BadRequestException(
        'El participante está dado de baja: hay que reactivarlo antes de otorgar una excepción',
      );
    }

    const estadoDetalle = await this.estadoDocumental.porInscripcion(inscripcionId);
    if (!estadoDetalle.bloqueada) {
      throw new BadRequestException('La inscripción no se encuentra bloqueada por documentación');
    }

    const excepcionesPrevias = await this.prisma.habilitacionExcepcional.count({
      where: { inscripcionId },
    });
    if (excepcionesPrevias > 0) {
      throw new BadRequestException(
        'La inscripción ya utilizó su habilitación excepcional única y no puede recibir otra',
      );
    }

    const hoy = new Date();
    // Se calcula la fecha límite de vigencia hasta las 23:59:59.999 UTC del día resultante
    const fechaHasta = new Date(
      Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + dto.dias, 23, 59, 59, 999),
    );

    return this.prisma.$transaction(async (tx) => {
      const habilitacion = await tx.habilitacionExcepcional.create({
        data: {
          inscripcionId,
          motivo: dto.motivo,
          hasta: fechaHasta,
          responsableId,
        },
        include: {
          responsable: {
            select: { id: true, nombre: true, apellido: true, email: true },
          },
        },
      });

      const formatoFecha = `${String(fechaHasta.getUTCDate()).padStart(2, '0')}/${String(fechaHasta.getUTCMonth() + 1).padStart(2, '0')}/${fechaHasta.getUTCFullYear()}`;

      await this.auditoria.registrar(
        {
          accion: 'CREAR',
          entidad: 'HabilitacionExcepcional',
          idEntidad: habilitacion.id,
          detalle: `Habilitación excepcional concedida a ${inscripcion.persona.apellido} ${inscripcion.persona.nombre} (DNI ${inscripcion.persona.dni}) en ${inscripcion.disciplina.nombre} por ${dto.dias} días (hasta el ${formatoFecha}). Motivo: ${dto.motivo}`,
          responsableId,
        },
        tx,
      );

      return habilitacion;
    });
  }

  /**
   * Listar las habilitaciones excepcionales registradas para una inscripción (US-28).
   */
  async listarHabilitacionesExcepcionales(
    inscripcionId: number,
    usuario?: { id: number; roles: readonly string[] },
  ) {
    const inscripcion = await this.prisma.inscripcion.findUnique({
      where: { id: inscripcionId },
      select: { id: true, disciplinaId: true },
    });
    if (!inscripcion) throw new NotFoundException('Inscripción no encontrada');
    await this.exigirDisciplinaACargo(usuario, inscripcion.disciplinaId);

    return this.prisma.habilitacionExcepcional.findMany({
      where: { inscripcionId },
      orderBy: { creadoEn: 'desc' },
      include: {
        responsable: {
          select: { id: true, nombre: true, apellido: true, email: true },
        },
      },
    });
  }

  /**
   * US-63: Catálogo de disciplinas y categorías activas para que los socios
   * puedan consultar aranceles, documentación requerida y restricciones.
   */
  async catalogo(usuarioId: number) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      include: {
        persona: {
          include: {
            membresias: { where: { activo: true } },
            inscripciones: { where: { activo: true } },
            solicitudesInscripcion: { where: { estado: EstadoSolicitudInscripcion.PENDIENTE } },
          },
        },
      },
    });

    const persona = usuario?.persona ?? null;
    const esSocio = (persona?.membresias?.length ?? 0) > 0;
    const periodo = periodoActual();

    const disciplinas = await this.prisma.disciplina.findMany({
      where: { activo: true },
      orderBy: { nombre: 'asc' },
      include: {
        categorias: {
          where: { activo: true },
          orderBy: { nombre: 'asc' },
          include: {
            requerimientosDoc: {
              orderBy: { tipoDocumento: 'asc' },
            },
          },
        },
        requerimientosDoc: {
          where: { categoriaDisciplinaId: null },
          orderBy: { tipoDocumento: 'asc' },
        },
        configuracionesCuotaDeportiva: {
          where: { activo: true },
          orderBy: { periodoAplicacion: 'desc' },
        },
      },
    });

    const items = disciplinas.map((d) => {
      const tarifasDeporte = d.configuracionesCuotaDeportiva.map((c) => ({
        id: c.id,
        categoriaDisciplinaId: c.categoriaDisciplinaId,
        periodoAplicacion: c.periodoAplicacion,
        monto: Number(c.monto),
        descuentoSocioPorcentaje: c.descuentoSocioPorcentaje,
        activo: c.activo,
      }));

      const tarifaDisc = tarifaVigente(tarifasDeporte, null, periodo);
      const arancelDisciplina = tarifaDisc ? montoACobrar(tarifaDisc, esSocio) : 0;

      const docsDisciplina = d.requerimientosDoc.map((r) => ({
        tipoDocumento: r.tipoDocumento,
        nombre: ETIQUETA_TIPO_DOCUMENTO[r.tipoDocumento] || r.tipoDocumento,
        plazoDiasTolerancia: r.plazoDiasTolerancia,
      }));

      const categorias = d.categorias.map((cat) => {
        const tarifaCat = tarifaVigente(tarifasDeporte, cat.id, periodo);
        const arancelCat = tarifaCat ? montoACobrar(tarifaCat, esSocio) : arancelDisciplina;

        const tiposYaIncluidos = new Set(docsDisciplina.map((r) => r.tipoDocumento));
        const docsCategoria = [
          ...docsDisciplina,
          ...cat.requerimientosDoc
            .filter((r) => !tiposYaIncluidos.has(r.tipoDocumento))
            .map((r) => ({
              tipoDocumento: r.tipoDocumento,
              nombre: ETIQUETA_TIPO_DOCUMENTO[r.tipoDocumento] || r.tipoDocumento,
              plazoDiasTolerancia: r.plazoDiasTolerancia,
            })),
        ];

        const motivos = persona
          ? motivosDeIncumplimiento(persona, restriccionesEfectivas(d, cat))
          : [];

        return {
          id: cat.id,
          nombre: cat.nombre,
          genero: cat.genero,
          edadMinima: cat.edadMinima,
          edadMaxima: cat.edadMaxima,
          arancelMensual: arancelCat,
          documentosObligatorios: docsCategoria,
          cumpleRestricciones: motivos.length === 0,
          motivosIncumplimiento: motivos,
        };
      });

      const motivosDisc = persona
        ? motivosDeIncumplimiento(persona, restriccionesEfectivas(d, null))
        : [];

      const inscripto = persona?.inscripciones.some((i) => i.disciplinaId === d.id) ?? false;
      const solicitudPendiente =
        persona?.solicitudesInscripcion.some((s) => s.disciplinaId === d.id) ?? false;

      return {
        id: d.id,
        nombre: d.nombre,
        descripcion: d.descripcion,
        genero: d.genero,
        edadMinima: d.edadMinima,
        edadMaxima: d.edadMaxima,
        solicitaDocumentacion: d.solicitaDocumentacion,
        arancelMensual: arancelDisciplina,
        descuentoSocioPorcentaje: tarifaDisc?.descuentoSocioPorcentaje ?? 0,
        documentosObligatorios: docsDisciplina,
        categorias,
        cumpleRestricciones: motivosDisc.length === 0,
        motivosIncumplimiento: motivosDisc,
        inscripto,
        solicitudPendiente,
      };
    });

    return {
      esSocio,
      items,
    };
  }

  /**
   * US-63: Solicitar inscripción a una disciplina y categoría activa.
   */
  async solicitar(dto: SolicitarInscripcionDto, usuarioId: number) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      include: {
        persona: {
          include: {
            membresias: { where: { activo: true } },
            inscripciones: { where: { activo: true } },
          },
        },
      },
    });

    if (!usuario?.persona) {
      throw new NotFoundException('No se encontró una ficha de persona asociada al usuario');
    }

    const persona = usuario.persona;
    if (!persona.activo) {
      throw new BadRequestException(
        'El participante está dado de baja: hay que reactivarlo antes de postularse',
      );
    }

    const disciplina = await this.prisma.disciplina.findUnique({
      where: { id: dto.disciplinaId },
      include: {
        categorias: true,
        requerimientosDoc: true,
      },
    });

    if (!disciplina) {
      throw new NotFoundException('Disciplina no encontrada');
    }
    if (!disciplina.activo) {
      throw new BadRequestException('Disciplina inactiva');
    }

    let categoria: (typeof disciplina.categorias)[0] | null = null;
    const categoriasActivas = disciplina.categorias.filter((c) => c.activo);
    if (categoriasActivas.length > 0 && !dto.categoriaDisciplinaId) {
      throw new BadRequestException(
        'Debe seleccionar una categoría para inscribirse en esta disciplina',
      );
    }

    if (dto.categoriaDisciplinaId) {
      categoria = disciplina.categorias.find((c) => c.id === dto.categoriaDisciplinaId) ?? null;
      if (!categoria || !categoria.activo) {
        throw new BadRequestException(
          'La categoría indicada no pertenece a esta disciplina o no está activa',
        );
      }
    }

    // Validación de restricciones de edad y género
    this.validarRestricciones(persona, disciplina, categoria);

    // Validación de duplicidad: inscripción activa o solicitud previa en estado PENDIENTE
    const inscripcionActiva = await this.prisma.inscripcion.findFirst({
      where: {
        personaId: persona.id,
        disciplinaId: disciplina.id,
        activo: true,
      },
    });
    if (inscripcionActiva) {
      throw new ConflictException('Ya te encontrás inscripto en esta disciplina');
    }

    const solicitudPendiente = await this.prisma.solicitudInscripcion.findFirst({
      where: {
        personaId: persona.id,
        disciplinaId: disciplina.id,
        estado: EstadoSolicitudInscripcion.PENDIENTE,
      },
    });
    if (solicitudPendiente) {
      throw new ConflictException(
        'Ya tenés una solicitud de inscripción pendiente para esta disciplina',
      );
    }

    const ahora = new Date();
    return this.prisma.$transaction(async (tx) => {
      await this.exigirDocumentosAlInscribir(
        tx,
        persona.id,
        disciplina.id,
        categoria?.id,
        undefined,
      );

      const solicitud = await tx.solicitudInscripcion.create({
        data: {
          personaId: persona.id,
          disciplinaId: disciplina.id,
          categoriaDisciplinaId: categoria?.id ?? null,
          estado: EstadoSolicitudInscripcion.PENDIENTE,
          fechaSolicitud: ahora,
        },
        include: {
          disciplina: { select: { id: true, nombre: true } },
          categoriaDisciplina: { select: { id: true, nombre: true } },
          persona: { select: { id: true, nombre: true, apellido: true, dni: true } },
        },
      });

      await this.auditoria.registrar(
        {
          accion: 'CREAR',
          entidad: 'SolicitudInscripcion',
          idEntidad: solicitud.id,
          responsableId: usuarioId,
          detalle: `Solicitud de inscripción a ${disciplina.nombre}${categoria ? ` (${categoria.nombre})` : ''} registrada por ${persona.apellido} ${persona.nombre} (DNI ${persona.dni})`,
        },
        tx,
      );

      return solicitud;
    });
  }

  /**
   * H13: un requisito con plazo 0 hay que tenerlo al inscribir. Cuenta un documento
   * aprobado y no vencido, o uno adjunto en la misma operación de alta.
   */
  private async exigirDocumentosAlInscribir(
    db: Prisma.TransactionClient,
    personaId: number,
    disciplinaId: number,
    categoriaDisciplinaId: number | null | undefined,
    adjuntos: { tipoDocumento: TipoDocumentacionDisciplina }[] | undefined,
  ) {
    const requisitos = await db.disciplinaRequerimientoDoc.findMany({
      where: {
        disciplinaId,
        OR: [
          { categoriaDisciplinaId: null },
          ...(categoriaDisciplinaId ? [{ categoriaDisciplinaId }] : []),
        ],
      },
      select: { tipoDocumento: true, plazoDiasTolerancia: true },
    });
    const alInscribirse = requisitos.filter((r) => r.plazoDiasTolerancia === 0);
    if (!alInscribirse.length) return;

    const cubiertos = new Set(adjuntos?.map((d) => d.tipoDocumento) ?? []);
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const presentados = await db.documentacion.findMany({
      where: {
        personaId,
        estadoRevision: 'APROBADO',
        tipoDocumento: { in: alInscribirse.map((r) => r.tipoDocumento) },
      },
      select: { tipoDocumento: true, fechaVencimiento: true, creadoEn: true },
      orderBy: { creadoEn: 'desc' },
    });
    const visto = new Set<TipoDocumentacionDisciplina>();
    const vigente = new Set<TipoDocumentacionDisciplina>();
    for (const doc of presentados) {
      if (!doc.tipoDocumento || visto.has(doc.tipoDocumento)) continue;
      visto.add(doc.tipoDocumento);
      if (!doc.fechaVencimiento || doc.fechaVencimiento >= hoy) vigente.add(doc.tipoDocumento);
    }

    const faltan = [
      ...new Set(
        alInscribirse
          .filter((r) => !cubiertos.has(r.tipoDocumento) && !vigente.has(r.tipoDocumento))
          .map((r) => ETIQUETA_TIPO_DOCUMENTO[r.tipoDocumento]),
      ),
    ];
    if (faltan.length) {
      throw new BadRequestException(`Para inscribir hay que presentar ${faltan.join(' y ')}.`);
    }
  }

  /**
   * US-63 / US-64: Listar solicitudes de inscripción de la persona asociada al usuario autenticado.
   * Ordenadas cronológicamente de la más reciente a la más antigua (fechaSolicitud DESC).
   * Opcionalmente filtradas por estado.
   */
  async misSolicitudes(usuarioId: number, estado?: EstadoSolicitudInscripcion) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: { personaId: true },
    });
    if (!usuario?.personaId) {
      throw new NotFoundException('No se encontró una ficha de persona asociada al usuario');
    }

    return this.prisma.solicitudInscripcion.findMany({
      where: {
        personaId: usuario.personaId,
        ...(estado ? { estado } : {}),
      },
      orderBy: { fechaSolicitud: 'desc' },
      include: {
        disciplina: { select: { id: true, nombre: true, descripcion: true } },
        categoriaDisciplina: { select: { id: true, nombre: true } },
      },
    });
  }

  /**
   * US-66 (CA 1-2): Listar solicitudes de inscripción a disciplinas para evaluación administrativa.
   * - Por defecto muestra las solicitudes en estado PENDIENTE.
   * - Permite filtrar por disciplina (`disciplinaId`) y buscar por nombre, apellido o DNI del socio.
   * - Devuelve para cada solicitud si el socio cuenta con la documentación obligatoria exigida
   *   por la disciplina/categoría o si tiene documentos faltantes.
   */
  async listarSolicitudes(query: FindSolicitudesInscripcionQueryDto = {}) {
    const estadoFiltro = query.estado ?? EstadoSolicitudInscripcion.PENDIENTE;
    const termino = query.busqueda?.trim();
    const soloDigitos = termino ? termino.replace(/\D/g, '') : '';
    const palabras = termino ? termino.split(/[\s,]+/).filter(Boolean) : [];

    const condicionesPersona: Prisma.PersonaWhereInput[] = termino
      ? [
          { nombre: { contains: termino, mode: 'insensitive' } },
          { apellido: { contains: termino, mode: 'insensitive' } },
          { dni: { contains: termino, mode: 'insensitive' } },
          ...(soloDigitos && soloDigitos !== termino
            ? [{ dni: { contains: soloDigitos, mode: 'insensitive' as const } }]
            : []),
          ...(palabras.length > 1
            ? [
                {
                  AND: palabras.map((palabra) => ({
                    OR: [
                      { nombre: { contains: palabra, mode: 'insensitive' as const } },
                      { apellido: { contains: palabra, mode: 'insensitive' as const } },
                    ],
                  })),
                },
              ]
            : []),
        ]
      : [];

    const solicitudes = await this.prisma.solicitudInscripcion.findMany({
      where: {
        estado: estadoFiltro,
        ...(query.disciplinaId ? { disciplinaId: query.disciplinaId } : {}),
        ...(condicionesPersona.length > 0 ? { persona: { OR: condicionesPersona } } : {}),
      },
      orderBy: { fechaSolicitud: 'asc' },
      include: {
        persona: {
          select: {
            id: true,
            nombre: true,
            apellido: true,
            dni: true,
            email: true,
            telefono: true,
            activo: true,
          },
        },
        disciplina: {
          select: {
            id: true,
            nombre: true,
            descripcion: true,
            solicitaDocumentacion: true,
          },
        },
        categoriaDisciplina: {
          select: {
            id: true,
            nombre: true,
          },
        },
        revisadoPor: {
          select: {
            id: true,
            nombre: true,
            apellido: true,
            email: true,
          },
        },
      },
    });

    return Promise.all(
      solicitudes.map(async (s) => {
        const previsualizacion = await this.estadoDocumental.previsualizar(
          s.disciplinaId,
          s.categoriaDisciplinaId ?? null,
          s.personaId,
        );
        const documentos = previsualizacion?.documentos ?? [];
        const requiereDocumentacion = documentos.length > 0;
        const faltantes = documentos
          .filter((d) => d.estado === 'FALTANTE' || d.estado === 'VENCIDO')
          .map((d) => d.etiqueta);
        const completa = faltantes.length === 0;
        const estadoResultante: 'HABILITADO' | 'PENDIENTE' = completa ? 'HABILITADO' : 'PENDIENTE';

        return {
          ...s,
          documentacion: {
            estado: estadoResultante,
            completa,
            requiereDocumentacion,
            documentos,
            faltantes,
            motivos: previsualizacion?.motivos ?? [],
          },
        };
      }),
    );
  }

  /**
   * US-66 (CA 3): Aprobar una solicitud de inscripción pendiente.
   * - Cambia el estado de la solicitud a APROBADA.
   * - Crea automáticamente (o reactiva si existía baja previa) la inscripción del socio
   *   en la disciplina/categoría, quedando en estado Habilitada o Pendiente de documentación
   *   según corresponda.
   * - Abre el período de inscripción y genera la cuota deportiva correspondiente.
   */
  async aprobarSolicitud(id: number, responsableId: number) {
    const solicitud = await this.prisma.solicitudInscripcion.findUnique({
      where: { id },
      include: {
        persona: true,
        disciplina: { include: { categorias: true } },
        categoriaDisciplina: true,
      },
    });

    if (!solicitud) {
      throw new NotFoundException('Solicitud de inscripción no encontrada');
    }

    if (
      solicitud.estado !== EstadoSolicitudInscripcion.PENDIENTE &&
      solicitud.estado !== EstadoSolicitudInscripcion.PENDIENTE_DOCUMENTACION
    ) {
      throw new BadRequestException('Solo se pueden aprobar solicitudes de inscripción pendientes');
    }

    if (solicitud.persona.activo === false) {
      throw new BadRequestException(
        'El participante está dado de baja: hay que reactivarlo antes de inscribirlo',
      );
    }

    if (!solicitud.disciplina.activo) {
      throw new BadRequestException('Disciplina inactiva');
    }

    if (solicitud.categoriaDisciplina && !solicitud.categoriaDisciplina.activo) {
      throw new BadRequestException(
        'La categoría indicada no pertenece a esta disciplina o no está activa',
      );
    }

    const inscripcionExistente = await this.prisma.inscripcion.findUnique({
      where: {
        personaId_disciplinaId: {
          personaId: solicitud.personaId,
          disciplinaId: solicitud.disciplinaId,
        },
      },
    });

    if (inscripcionExistente?.activo) {
      throw new ConflictException('El socio ya se encuentra inscripto en esta disciplina');
    }

    const resultado = await this.prisma.$transaction(async (tx) => {
      const ahora = new Date();
      const { count } = await tx.solicitudInscripcion.updateMany({
        where: {
          id,
          estado: {
            in: [
              EstadoSolicitudInscripcion.PENDIENTE,
              EstadoSolicitudInscripcion.PENDIENTE_DOCUMENTACION,
            ],
          },
        },
        data: {
          estado: EstadoSolicitudInscripcion.APROBADA,
          fechaResolucion: ahora,
          revisadoPorId: responsableId,
          motivoRechazo: null,
        },
      });

      if (count === 0) {
        throw new ConflictException(
          'La solicitud cambió de estado mientras tanto. Actualizá la página.',
        );
      }

      const solicitudActualizada = await tx.solicitudInscripcion.findUniqueOrThrow({
        where: { id },
        include: {
          persona: { select: { id: true, nombre: true, apellido: true, dni: true } },
          disciplina: { select: { id: true, nombre: true } },
          categoriaDisciplina: { select: { id: true, nombre: true } },
          revisadoPor: { select: { id: true, nombre: true, apellido: true, email: true } },
        },
      });

      let inscripcionFinal;
      if (inscripcionExistente) {
        inscripcionFinal = await tx.inscripcion.update({
          where: { id: inscripcionExistente.id },
          data: {
            activo: true,
            fechaInscripcion: ahora,
            fechaBaja: null,
            requisitosDesde: null,
            categoriaDisciplinaId: solicitud.categoriaDisciplinaId ?? null,
          },
        });
        await abrirPeriodo(tx, inscripcionFinal.id, ahora);

        await this.auditoria.registrar(
          {
            accion: 'REACTIVAR',
            entidad: 'Inscripcion',
            idEntidad: inscripcionFinal.id,
            detalle: `Re-inscripción por aprobación de solicitud de ${solicitud.persona.apellido} ${solicitud.persona.nombre}, ${solicitud.persona.dni} en la disciplina ${solicitud.disciplina.nombre}`,
            responsableId,
          },
          tx,
        );
      } else {
        inscripcionFinal = await tx.inscripcion.create({
          data: {
            personaId: solicitud.personaId,
            disciplinaId: solicitud.disciplinaId,
            categoriaDisciplinaId: solicitud.categoriaDisciplinaId ?? null,
          },
        });
        await abrirPeriodo(tx, inscripcionFinal.id, inscripcionFinal.fechaInscripcion ?? ahora);

        await this.auditoria.registrar(
          {
            accion: 'CREAR',
            entidad: 'Inscripcion',
            idEntidad: inscripcionFinal.id,
            detalle: `Inscripción por aprobación de solicitud de ${solicitud.persona.apellido} ${solicitud.persona.nombre}, ${solicitud.persona.dni} en la disciplina ${solicitud.disciplina.nombre}`,
            responsableId,
          },
          tx,
        );
      }

      await this.auditoria.registrar(
        {
          accion: 'EDITAR',
          entidad: 'SolicitudInscripcion',
          idEntidad: solicitud.id,
          detalle: `Solicitud de inscripción a ${solicitud.disciplina.nombre}${solicitud.categoriaDisciplina ? ` (${solicitud.categoriaDisciplina.nombre})` : ''} aprobada para ${solicitud.persona.apellido} ${solicitud.persona.nombre} (DNI ${solicitud.persona.dni})`,
          responsableId,
        },
        tx,
      );

      const periodo = periodoActual();
      const rawTarifas = tx.configuracionCuotaDeportiva
        ? await tx.configuracionCuotaDeportiva.findMany({
            where: { disciplinaId: solicitud.disciplinaId, activo: true },
          })
        : [];
      const tarifas = Array.isArray(rawTarifas) ? rawTarifas : [];
      const membresiaActiva = tx.membresia
        ? await tx.membresia.findFirst({
            where: { personaId: solicitud.personaId, activo: true },
          })
        : null;

      const tarifa = tarifaVigente(
        tarifas.map((t) => ({
          id: t.id,
          categoriaDisciplinaId: t.categoriaDisciplinaId,
          periodoAplicacion: t.periodoAplicacion,
          monto: Number(t.monto),
          descuentoSocioPorcentaje: t.descuentoSocioPorcentaje,
          activo: t.activo,
        })),
        solicitud.categoriaDisciplinaId ?? null,
        periodo,
      );
      const esSocio = !!membresiaActiva;
      const cuotaGenerada = tarifa
        ? {
            periodo,
            monto: montoACobrar(tarifa, esSocio),
            montoTarifa: Number(tarifa.monto),
            descuentoSocioPorcentaje: esSocio ? tarifa.descuentoSocioPorcentaje : 0,
            esSocio,
            sinTarifa: false,
          }
        : {
            periodo,
            monto: null,
            montoTarifa: null,
            descuentoSocioPorcentaje: 0,
            esSocio,
            sinTarifa: true,
          };

      return {
        solicitud: solicitudActualizada,
        inscripcion: inscripcionFinal,
        cuotaGenerada,
      };
    });

    const estadoDoc =
      (await this.estadoDocumentalDe(solicitud.personaId, resultado.inscripcion.id)) ??
      (await this.estadoDocumental.previsualizar(
        solicitud.disciplinaId,
        solicitud.categoriaDisciplinaId ?? null,
        solicitud.personaId,
      ));

    return {
      ...resultado,
      estadoDocumental: estadoDoc,
    };
  }

  /**
   * US-66 (CA 4): Rechazar una solicitud de inscripción pendiente exigiendo un motivo obligatorio.
   */
  async rechazarSolicitud(id: number, dto: RechazarSolicitudInscripcionDto, responsableId: number) {
    const motivo = dto.motivo?.trim();
    if (!motivo) {
      throw new BadRequestException('El motivo de rechazo es obligatorio');
    }

    const solicitud = await this.prisma.solicitudInscripcion.findUnique({
      where: { id },
      include: {
        persona: true,
        disciplina: true,
        categoriaDisciplina: true,
      },
    });

    if (!solicitud) {
      throw new NotFoundException('Solicitud de inscripción no encontrada');
    }

    if (
      solicitud.estado !== EstadoSolicitudInscripcion.PENDIENTE &&
      solicitud.estado !== EstadoSolicitudInscripcion.PENDIENTE_DOCUMENTACION
    ) {
      throw new BadRequestException(
        'Solo se pueden rechazar solicitudes de inscripción pendientes',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const ahora = new Date();
      const { count } = await tx.solicitudInscripcion.updateMany({
        where: {
          id,
          estado: {
            in: [
              EstadoSolicitudInscripcion.PENDIENTE,
              EstadoSolicitudInscripcion.PENDIENTE_DOCUMENTACION,
            ],
          },
        },
        data: {
          estado: EstadoSolicitudInscripcion.RECHAZADA,
          motivoRechazo: motivo,
          fechaResolucion: ahora,
          revisadoPorId: responsableId,
        },
      });

      if (count === 0) {
        throw new ConflictException(
          'La solicitud cambió de estado mientras tanto. Actualizá la página.',
        );
      }

      const solicitudActualizada = await tx.solicitudInscripcion.findUniqueOrThrow({
        where: { id },
        include: {
          persona: { select: { id: true, nombre: true, apellido: true, dni: true } },
          disciplina: { select: { id: true, nombre: true } },
          categoriaDisciplina: { select: { id: true, nombre: true } },
          revisadoPor: { select: { id: true, nombre: true, apellido: true, email: true } },
        },
      });

      await this.auditoria.registrar(
        {
          accion: 'EDITAR',
          entidad: 'SolicitudInscripcion',
          idEntidad: solicitud.id,
          detalle: `Solicitud de inscripción a ${solicitud.disciplina.nombre}${solicitud.categoriaDisciplina ? ` (${solicitud.categoriaDisciplina.nombre})` : ''} rechazada para ${solicitud.persona.apellido} ${solicitud.persona.nombre} (DNI ${solicitud.persona.dni}). Motivo: ${motivo}`,
          responsableId,
        },
        tx,
      );

      return solicitudActualizada;
    });
  }

  /**
   * US-65: cancela una solicitud propia pendiente o una inscripción aprobada vigente.
   */
  async cancelarSolicitud(solicitudId: number, usuarioId: number) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: { personaId: true },
    });
    if (!usuario?.personaId) {
      throw new NotFoundException('No se encontró una ficha de persona asociada al usuario');
    }

    const solicitud = await this.prisma.solicitudInscripcion.findUnique({
      where: { id: solicitudId },
      include: { disciplina: { select: { nombre: true } } },
    });
    if (!solicitud || solicitud.personaId !== usuario.personaId) {
      throw new NotFoundException('Solicitud de inscripción no encontrada');
    }
    if (
      solicitud.estado !== EstadoSolicitudInscripcion.PENDIENTE &&
      solicitud.estado !== EstadoSolicitudInscripcion.PENDIENTE_DOCUMENTACION &&
      solicitud.estado !== EstadoSolicitudInscripcion.APROBADA
    ) {
      throw new BadRequestException(
        'Solo se pueden cancelar solicitudes pendientes o aprobadas vigentes',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const actualizada = await tx.solicitudInscripcion.updateMany({
        where: {
          id: solicitudId,
          personaId: usuario.personaId,
          estado: solicitud.estado,
        },
        data: { estado: EstadoSolicitudInscripcion.CANCELADA },
      });

      if (actualizada.count === 0) {
        throw new BadRequestException(
          'La solicitud ya no se encuentra en estado PENDIENTE y no puede cancelarse',
        );
      }

      if (solicitud.estado === EstadoSolicitudInscripcion.APROBADA) {
        const inscripcion = await tx.inscripcion.findFirst({
          where: {
            personaId: usuario.personaId,
            disciplinaId: solicitud.disciplinaId,
            activo: true,
          },
        });
        if (inscripcion) {
          const ahora = new Date();
          await tx.inscripcion.update({
            where: { id: inscripcion.id },
            data: { activo: false, fechaBaja: ahora },
          });
          await cerrarPeriodos(tx, [inscripcion.id], ahora);
          await this.auditoria.registrar(
            {
              accion: 'BAJA',
              entidad: 'Inscripcion',
              idEntidad: inscripcion.id,
              responsableId: usuarioId,
              detalle: 'Inscripción cancelada por el socio desde la solicitud aprobada',
            },
            tx,
          );
        }
      }

      const resultado = await tx.solicitudInscripcion.findUnique({
        where: { id: solicitudId },
        include: {
          disciplina: { select: { id: true, nombre: true, descripcion: true } },
          categoriaDisciplina: { select: { id: true, nombre: true } },
        },
      });

      await this.auditoria.registrar(
        {
          accion: 'BAJA',
          entidad: 'SolicitudInscripcion',
          idEntidad: solicitudId,
          responsableId: usuarioId,
          detalle: `Solicitud de inscripción a ${solicitud.disciplina.nombre} cancelada por el socio`,
        },
        tx,
      );

      return resultado;
    });
  }

  async subirDocumentacionSolicitud(
    solicitudId: number,
    usuarioId: number,
    dto: SubirSolicitudDocumentacionDto,
    archivo?: ArchivoSubido,
  ) {
    if (!archivo) {
      throw new BadRequestException('Adjuntá el archivo del documento (PDF o imagen).');
    }

    const [solicitud, usuario] = await Promise.all([
      this.prisma.solicitudInscripcion.findUnique({
        where: { id: solicitudId },
        include: { disciplina: { select: { nombre: true } } },
      }),
      this.prisma.usuario.findUnique({
        where: { id: usuarioId },
        select: { personaId: true },
      }),
    ]);
    if (!solicitud || !usuario?.personaId || solicitud.personaId !== usuario.personaId) {
      throw new NotFoundException('Solicitud de inscripción no encontrada');
    }
    if (
      solicitud.estado !== EstadoSolicitudInscripcion.PENDIENTE &&
      solicitud.estado !== EstadoSolicitudInscripcion.PENDIENTE_DOCUMENTACION
    ) {
      throw new BadRequestException(
        'Solo se puede adjuntar documentación a solicitudes pendientes',
      );
    }

    const rawFecha = dto.fechaVencimiento?.trim();
    if (!rawFecha && requiereVencimiento(dto.tipoDocumento)) {
      throw new BadRequestException('La fecha de vencimiento es obligatoria.');
    }
    const fechaVencimiento = rawFecha ? new Date(`${rawFecha}T00:00:00`) : null;
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    if (fechaVencimiento && fechaVencimiento < hoy) {
      throw new BadRequestException(
        'La fecha de vencimiento no puede ser anterior a la fecha actual.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const documentacion = await tx.documentacion.create({
        data: {
          tipoDocumento: dto.tipoDocumento,
          tipo: dto.tipo?.trim() || dto.tipoDocumento,
          fechaVencimiento,
          personaId: usuario.personaId,
          archivoNombre: archivo.originalname,
          archivoRuta: archivo.filename,
          mimeType: archivo.mimetype,
          tamano: archivo.size,
          estadoRevision: 'PENDIENTE_REVISION',
          cargadoPorTitular: true,
        },
      });
      await tx.solicitudInscripcion.update({
        where: { id: solicitudId },
        data: { estado: EstadoSolicitudInscripcion.PENDIENTE_DOCUMENTACION },
      });
      await this.auditoria.registrar(
        {
          accion: 'CREAR',
          entidad: 'Documentacion',
          idEntidad: documentacion.id,
          responsableId: usuarioId,
          detalle: `Documento adjuntado a la solicitud ${solicitudId} de ${solicitud.disciplina.nombre}`,
        },
        tx,
      );
      return documentacion;
    });
  }
}
