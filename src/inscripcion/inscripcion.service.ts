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
import {
  EstadoInscripcionFiltro,
  FindParticipantesQueryDto,
} from './dto/find-participantes-query.dto';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { EstadoDocumentalService } from '../documentacion/estado-documental.service';
import {
  motivosDeIncumplimiento,
  restriccionesEfectivas,
  type Restricciones,
} from '../disciplinas/restricciones';
import { ETIQUETA_TIPO_DOCUMENTO } from '../disciplinas/requerimientos-doc';
import { periodoActual } from '../cuotas/cuotas.service';
import { tarifaVigente, montoACobrar } from '../cuotas/tarifas';

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

  /** US-05/25: estado documental de una inscripción recién creada o editada. */
  private async estadoDocumentalDe(personaId: number, inscripcionId: number) {
    const resumen = await this.estadoDocumental.porPersona(personaId);
    return resumen.inscripciones.find((i) => i.inscripcionId === inscripcionId) ?? null;
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
          const reactivada = await tx.inscripcion.update({
            where: { id: inscripcionExistente.id },
            data: {
              activo: true,
              fechaInscripcion: new Date(),
              fechaBaja: null,
              requisitosDesde: null,
              categoriaDisciplinaId: dto.categoriaDisciplinaId ?? null,
            },
          });

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
                    ...(dto.categoriaDisciplinaId ? [{ categoriaDisciplinaId: dto.categoriaDisciplinaId }] : []),
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

            const soloFecha = /^(\d{4})-(\d{2})-(\d{2})/.exec(doc.fechaVencimiento);
            const fechaVencimiento = soloFecha
              ? new Date(Number(soloFecha[1]), Number(soloFecha[2]) - 1, Number(soloFecha[3]))
              : new Date(doc.fechaVencimiento);

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

            if (tx.documentacion) {
              const docCreado = await tx.documentacion.create({
                data: {
                  tipoDocumento: doc.tipoDocumento,
                  tipo: doc.tipo?.trim() || ETIQUETA_TIPO_DOCUMENTO[doc.tipoDocumento] || doc.tipoDocumento,
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
        const inscripcionActualizada = inscripcionInactivaEnDestino
          ? await tx.inscripcion.update({
              where: { id: inscripcionInactivaEnDestino.id },
              data: {
                activo: true,
                fechaInscripcion: new Date(),
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
          await tx.inscripcion.update({ where: { id }, data: { activo: false, fechaBaja: new Date() } });

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

      await tx.inscripcion.updateMany({
        where: { personaId, activo: true },
        data: { activo: false, fechaBaja: new Date() },
      });

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
  async findAll(query: FindParticipantesQueryDto = { pagina: 1, porPagina: 10 }) {
    const { busqueda, disciplinaId, estado, pagina, porPagina } = query;

    const filtros: Prisma.PersonaWhereInput[] = [
      // Solo personas que participan en al menos una disciplina.
      { inscripciones: { some: {} } },
    ];

    if (busqueda && busqueda.trim()) {
      const termino = busqueda.trim();
      filtros.push({
        OR: [
          { nombre: { contains: termino, mode: 'insensitive' } },
          { apellido: { contains: termino, mode: 'insensitive' } },
          { dni: { contains: termino, mode: 'insensitive' } },
          { dni: { equals: termino } },
        ],
      });
    }

    if (disciplinaId) {
      filtros.push({ inscripciones: { some: { disciplinaId } } });
    }

    if (estado === EstadoInscripcionFiltro.INSCRIPTO) {
      filtros.push({ inscripciones: { some: { activo: true } } });
    } else if (estado === EstadoInscripcionFiltro.BAJA) {
      filtros.push({ inscripciones: { none: { activo: true } } });
    }

    const where: Prisma.PersonaWhereInput = { AND: filtros };

    const [items, total] = await this.prisma.$transaction([
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
        orderBy: [{ apellido: 'asc' }, { nombre: 'asc' }],
        skip: (pagina - 1) * porPagina,
        take: porPagina,
      }),
      this.prisma.persona.count({ where }),
    ]);

    const estados = await this.estadoDocumental.porPersonas(items.map((p) => p.id));
    return {
      items: items.map((p) => {
        const fila = this.aParticipanteAgrupado(p);
        const resumen = estados.get(p.id);
        return {
          ...fila,
          // US-08/25: estado documental del participante (el peor de sus inscripciones).
          estadoDocumental: resumen?.estado ?? null,
          disciplinas: fila.disciplinas.map((d) => {
            const detalle = resumen?.inscripciones.find((i) => i.inscripcionId === d.inscripcionId);
            return {
              ...d,
              estadoDocumental: detalle?.estado ?? null,
              motivosDocumentacion: detalle?.motivos ?? [],
            };
          }),
        };
      }),
      total,
      pagina,
      porPagina,
    };
  }

  /**
   * Inscripciones de una persona. Por defecto devuelve solo las vigentes
   * (incluirBajas = false). La página de edición de participante pide
   * incluirBajas = true para poder cargar y editar a un participante dado
   * de baja (US-07): sigue siendo participante aunque no tenga disciplinas
   * activas.
   */
  async findByPersonaId(personaId: number, incluirBajas = false) {
    return this.prisma.inscripcion.findMany({
      where: incluirBajas ? { personaId } : { personaId, activo: true },
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
      const dadaDeBaja = await tx.inscripcion.update({
        where: { id },
        data: { activo: false, fechaBaja: new Date() },
        include: { persona: true, disciplina: true, categoriaDisciplina: true },
      });

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
}
