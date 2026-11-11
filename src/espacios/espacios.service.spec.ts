import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ModalidadReserva, Prisma, TipoBloqueo, TipoEspacio } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { EspaciosService } from './espacios.service';
import { CreateEspacioDto } from './dto/create-espacio.dto';
import { CreateBloqueoDto } from './dto/create-bloqueo.dto';

describe('US-55 · EspaciosService', () => {
  let service: EspaciosService;
  let mockPrisma: any;
  let mockAuditoria: any;

  beforeEach(async () => {
    mockPrisma = {
      espacio: {
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      espacioDisciplina: {
        createMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      bloqueoAgenda: {
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        findFirst: jest.fn(),
      },
      disciplina: {
        findMany: jest.fn().mockResolvedValue([{ id: 1, nombre: 'Pádel' }]),
      },
      reserva: {
        findMany: jest.fn(),
      },
      $transaction: jest.fn((arg) => (Array.isArray(arg) ? Promise.all(arg) : arg(mockPrisma))),
    };

    mockAuditoria = {
      registrar: jest.fn().mockResolvedValue({ id: 1 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EspaciosService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditoriaService, useValue: mockAuditoria },
      ],
    }).compile();

    service = module.get<EspaciosService>(EspaciosService);
  });

  describe('US-55 · create (Crear espacio)', () => {
    const dtoValido: CreateEspacioDto = {
      nombre: 'Cancha de Pádel 1',
      tipo: TipoEspacio.DEPORTIVO,
      capacidadMaxima: 4,
      modalidad: ModalidadReserva.POR_HORA,
      precio: 12000,
      precioSocio: 9000,
      montoSena: 4000,
      disciplinaIds: [1],
      ubicacion: 'Sector Norte',
      bloqueos: [
        {
          tipo: TipoBloqueo.RECURRENTE,
          diasSemana: [1, 3, 5],
          horaInicio: '18:00',
          horaFin: '20:00',
          vigenteDesde: '2026-11-01',
          vigenteHasta: '2026-12-31',
          disciplinaId: 1,
          motivo: 'Entrenamiento escuelita',
        },
      ],
    };

    it('TC-ESP01 · crea un espacio deportivo con disciplinas y bloqueos, auditando la operación', async () => {
      mockPrisma.disciplina.findMany.mockResolvedValue([{ id: 1, nombre: 'Pádel' }]);
      mockPrisma.espacio.create.mockResolvedValue({ id: 10, ...dtoValido });
      mockPrisma.espacio.findUniqueOrThrow.mockResolvedValue({
        id: 10,
        nombre: 'Cancha de Pádel 1',
        tipo: TipoEspacio.DEPORTIVO,
        disciplinas: [{ disciplina: { id: 1, nombre: 'Pádel' } }],
        bloqueos: [{ id: 100, tipo: TipoBloqueo.RECURRENTE, activo: true }],
      });

      const resultado = await service.create(dtoValido, 99);

      expect(resultado.id).toBe(10);
      expect(mockPrisma.espacio.create).toHaveBeenCalled();
      expect(mockPrisma.espacioDisciplina.createMany).toHaveBeenCalledWith({
        data: [{ espacioId: 10, disciplinaId: 1 }],
      });
      expect(mockPrisma.bloqueoAgenda.create).toHaveBeenCalled();
      expect(mockAuditoria.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          accion: 'CREAR',
          entidad: 'Espacio',
          idEntidad: 10,
          responsableId: 99,
        }),
        mockPrisma,
      );
    });

    it('TC-ESP-02 · crea un espacio social (sin disciplinas, modalidad DIA_COMPLETO) exitosamente', async () => {
      const dtoSocialValido: CreateEspacioDto = {
        nombre: 'Salón de Fiestas y Eventos',
        tipo: TipoEspacio.SOCIAL,
        capacidadMaxima: 120,
        modalidad: ModalidadReserva.DIA_COMPLETO,
        precio: 85000,
        montoSena: 30000,
      };

      mockPrisma.espacio.create.mockResolvedValue({ id: 20, ...dtoSocialValido });
      mockPrisma.espacio.findUniqueOrThrow.mockResolvedValue({
        id: 20,
        nombre: 'Salón de Fiestas y Eventos',
        tipo: TipoEspacio.SOCIAL,
        disciplinas: [],
        bloqueos: [],
      });

      const resultado = await service.create(dtoSocialValido, 99);

      expect(resultado.id).toBe(20);
      expect(mockPrisma.espacio.create).toHaveBeenCalled();
      expect(mockPrisma.espacioDisciplina.createMany).not.toHaveBeenCalled();
      expect(mockAuditoria.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          accion: 'CREAR',
          entidad: 'Espacio',
          idEntidad: 20,
          responsableId: 99,
        }),
        mockPrisma,
      );
    });

    it('TC-ESP-03 · no permite asociar disciplinas a un espacio de tipo SOCIAL (Criterio 2)', async () => {
      const dtoSocial: CreateEspacioDto = {
        ...dtoValido,
        tipo: TipoEspacio.SOCIAL,
        disciplinaIds: [1],
      };

      await expect(service.create(dtoSocial, 99)).rejects.toThrow(
        new BadRequestException(
          'Los espacios de tipo SOCIAL no pueden asociarse a disciplinas deportivas.',
        ),
      );
    });

    it('TC-ESP03 · falla si alguna disciplina indicada no existe o no está activa', async () => {
      mockPrisma.disciplina.findMany.mockResolvedValue([]); // ninguna encontrada

      await expect(service.create(dtoValido, 99)).rejects.toThrow(
        new BadRequestException(
          'Una o más disciplinas indicadas no existen o se encuentran inactivas.',
        ),
      );
    });

    it('TC-ESP04 · falla si el monto de la seña es mayor al precio de alquiler', async () => {
      const dtoSenaInvalida: CreateEspacioDto = {
        ...dtoValido,
        precio: 10000,
        montoSena: 15000,
      };

      await expect(service.create(dtoSenaInvalida, 99)).rejects.toThrow(
        new BadRequestException(
          'El monto de la seña requerida no puede ser superior al precio total de alquiler.',
        ),
      );
    });

    it('TC-ESP05 · valida reglas de bloqueo recurrente: requiere días de la semana y vigencia (Criterio 3)', async () => {
      mockPrisma.disciplina.findMany.mockResolvedValue([{ id: 1 }]);

      const dtoSinDias: CreateEspacioDto = {
        ...dtoValido,
        bloqueos: [
          {
            tipo: TipoBloqueo.RECURRENTE,
            diasSemana: [],
            horaInicio: '10:00',
            horaFin: '12:00',
            vigenteHasta: '2026-12-31',
          },
        ],
      };

      await expect(service.create(dtoSinDias, 99)).rejects.toThrow(BadRequestException);
    });

    it('TC-ESP-05b · valida bloqueo recurrente sin horaInicio/horaFin o sin vigenteHasta', async () => {
      mockPrisma.disciplina.findMany.mockResolvedValue([{ id: 1 }]);

      const dtoSinHorarios: CreateEspacioDto = {
        ...dtoValido,
        bloqueos: [
          {
            tipo: TipoBloqueo.RECURRENTE,
            diasSemana: [1],
            vigenteHasta: '2026-12-31',
          },
        ],
      };

      await expect(service.create(dtoSinHorarios, 99)).rejects.toThrow(
        new BadRequestException(
          'Los bloqueos recurrentes deben indicar franja horaria completa (horaInicio y horaFin).',
        ),
      );

      const dtoSinVigencia: CreateEspacioDto = {
        ...dtoValido,
        bloqueos: [
          {
            tipo: TipoBloqueo.RECURRENTE,
            diasSemana: [1],
            horaInicio: '10:00',
            horaFin: '12:00',
          },
        ],
      };

      await expect(service.create(dtoSinVigencia, 99)).rejects.toThrow(
        new BadRequestException(
          'Los bloqueos recurrentes deben indicar la fecha límite de vigencia (vigenteHasta).',
        ),
      );
    });

    it('TC-ESP06 · valida reglas de bloqueo recurrente: horaFin posterior a horaInicio', async () => {
      mockPrisma.disciplina.findMany.mockResolvedValue([{ id: 1 }]);

      const dtoHorasInvalidas: CreateEspacioDto = {
        ...dtoValido,
        bloqueos: [
          {
            tipo: TipoBloqueo.RECURRENTE,
            diasSemana: [1],
            horaInicio: '14:00',
            horaFin: '12:00', // anterior a inicio
            vigenteHasta: '2026-12-31',
          },
        ],
      };

      await expect(service.create(dtoHorasInvalidas, 99)).rejects.toThrow(
        new BadRequestException(
          'La hora de fin del bloqueo debe ser posterior a la hora de inicio.',
        ),
      );
    });

    it('TC-ESP07 · valida reglas de bloqueo puntual: requiere fecha y motivo (Criterio 4)', async () => {
      mockPrisma.disciplina.findMany.mockResolvedValue([{ id: 1 }]);

      const dtoPuntualSinMotivo: CreateEspacioDto = {
        ...dtoValido,
        bloqueos: [
          {
            tipo: TipoBloqueo.PUNTUAL,
            fecha: '2026-11-25',
            motivo: '', // vacío
          },
        ],
      };

      await expect(service.create(dtoPuntualSinMotivo, 99)).rejects.toThrow(
        new BadRequestException('El motivo es obligatorio para bloqueos puntuales.'),
      );
    });

    it('TC-ESP07b · valida bloqueo puntual sin fecha', async () => {
      const dtoPuntualSinFecha: CreateEspacioDto = {
        ...dtoValido,
        bloqueos: [
          {
            tipo: TipoBloqueo.PUNTUAL,
            fecha: undefined,
            motivo: 'Evento sin fecha',
          },
        ],
      };

      await expect(service.create(dtoPuntualSinFecha, 99)).rejects.toThrow(
        new BadRequestException(
          'Los bloqueos puntuales deben indicar una fecha específica (fecha).',
        ),
      );
    });

    it('TC-ESP07c · valida bloqueo puntual con horario incompleto o invertido', async () => {
      const dtoIncompleto: CreateEspacioDto = {
        ...dtoValido,
        bloqueos: [
          {
            tipo: TipoBloqueo.PUNTUAL,
            fecha: '2026-11-25',
            horaInicio: '10:00',
            motivo: 'Incompleto',
          },
        ],
      };

      await expect(service.create(dtoIncompleto, 99)).rejects.toThrow(
        new BadRequestException(
          'Para configurar un rango horario en un bloqueo puntual debe indicar tanto horaInicio como horaFin.',
        ),
      );

      const dtoInvertido: CreateEspacioDto = {
        ...dtoValido,
        bloqueos: [
          {
            tipo: TipoBloqueo.PUNTUAL,
            fecha: '2026-11-25',
            horaInicio: '12:00',
            horaFin: '10:00',
            motivo: 'Invertido',
          },
        ],
      };

      await expect(service.create(dtoInvertido, 99)).rejects.toThrow(
        new BadRequestException(
          'La hora de fin del bloqueo debe ser posterior a la hora de inicio.',
        ),
      );
    });

    it('TC-ESP07d · valida bloqueo recurrente con vigencia invertida o disciplina no compatible', async () => {
      const dtoVigenciaInvertida: CreateEspacioDto = {
        ...dtoValido,
        bloqueos: [
          {
            tipo: TipoBloqueo.RECURRENTE,
            diasSemana: [1],
            horaInicio: '10:00',
            horaFin: '12:00',
            vigenteDesde: '2026-12-31',
            vigenteHasta: '2026-11-01',
          },
        ],
      };

      await expect(service.create(dtoVigenciaInvertida, 99)).rejects.toThrow(
        new BadRequestException(
          'La fecha límite de vigencia (vigenteHasta) no puede ser anterior a vigenteDesde.',
        ),
      );

      const dtoDisciplinaIncompatible: CreateEspacioDto = {
        ...dtoValido,
        disciplinaIds: [1],
        bloqueos: [
          {
            tipo: TipoBloqueo.RECURRENTE,
            diasSemana: [1],
            horaInicio: '10:00',
            horaFin: '12:00',
            vigenteHasta: '2026-12-31',
            disciplinaId: 999, // no está en disciplinaIds
          },
        ],
      };

      await expect(service.create(dtoDisciplinaIncompatible, 99)).rejects.toThrow(
        new BadRequestException(
          'La disciplina asociada al bloqueo debe ser una de las disciplinas compatibles con el espacio.',
        ),
      );
    });

    it('TC-ESP11 · Patrón Composite: crea un espacio padre y genera sus N sub-espacios en lote (ej. 3 canchas de tenis)', async () => {
      const dtoConLote: CreateEspacioDto = {
        nombre: 'Complejo de Tenis',
        tipo: TipoEspacio.DEPORTIVO,
        capacidadMaxima: 12,
        modalidad: ModalidadReserva.POR_HORA,
        ubicacion: 'Sede Central',
        precio: 10000,
        precioSocio: 8000,
        montoSena: 3000,
        disciplinaIds: [1],
        cantidadSubespacios: 3,
        prefijoSubespacio: 'Cancha de Tenis',
        capacidadSubespacio: 4,
      };

      mockPrisma.espacio.create
        .mockResolvedValueOnce({
          id: 20,
          nombre: 'Complejo de Tenis',
          tipo: TipoEspacio.DEPORTIVO,
          capacidadMaxima: 12,
        })
        .mockResolvedValueOnce({ id: 21, nombre: 'Cancha de Tenis 1', espacioPadreId: 20 })
        .mockResolvedValueOnce({ id: 22, nombre: 'Cancha de Tenis 2', espacioPadreId: 20 })
        .mockResolvedValueOnce({ id: 23, nombre: 'Cancha de Tenis 3', espacioPadreId: 20 });

      mockPrisma.espacio.findUniqueOrThrow.mockResolvedValue({
        id: 20,
        nombre: 'Complejo de Tenis',
        subespacios: [
          { id: 21, nombre: 'Cancha de Tenis 1' },
          { id: 22, nombre: 'Cancha de Tenis 2' },
          { id: 23, nombre: 'Cancha de Tenis 3' },
        ],
      });

      const resultado = await service.create(dtoConLote, 99);

      expect(resultado.subespacios).toHaveLength(3);
      // 1 padre + 3 hijos = 4 llamadas a espacio.create
      expect(mockPrisma.espacio.create).toHaveBeenCalledTimes(4);
      expect(mockAuditoria.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          detalle: expect.stringContaining('con 3 sub-espacios'),
        }),
        mockPrisma,
      );
    });

    it('TC-ESP12 · Patrón Composite: crea sub-espacios personalizados validando seña <= precio', async () => {
      const dtoSubInvalido: CreateEspacioDto = {
        ...dtoValido,
        subespacios: [{ nombre: 'Cancha VIP', precio: 5000, montoSena: 9000 }],
      };

      await expect(service.create(dtoSubInvalido, 99)).rejects.toThrow(
        new BadRequestException(
          'El monto de la seña del sub-espacio "Cancha VIP" no puede superar su precio de alquiler.',
        ),
      );
    });

    it('TC-ESP13 · Patrón Composite: valida existencia de espacioPadreId y máximo 2 niveles de jerarquía', async () => {
      mockPrisma.espacio.findUnique.mockResolvedValueOnce(null);
      await expect(service.create({ ...dtoValido, espacioPadreId: 999 }, 99)).rejects.toThrow(
        NotFoundException,
      );

      // Si el padre ya es un sub-espacio (tiene espacioPadreId !== null), rechaza 3er nivel
      mockPrisma.espacio.findUnique.mockResolvedValueOnce({
        id: 50,
        activo: true,
        espacioPadreId: 10,
      });
      await expect(service.create({ ...dtoValido, espacioPadreId: 50 }, 99)).rejects.toThrow(
        new BadRequestException(
          'No se puede asignar como padre a un sub-espacio; la jerarquía admite dos niveles (Padre -> Sub-espacio).',
        ),
      );
    });
  });

  describe('US-55 / US-56 · agregarBloqueo (Conflicto con reservas y alquileres)', () => {
    const bloqueoPuntual: CreateBloqueoDto = {
      tipo: TipoBloqueo.PUNTUAL,
      fecha: '2026-11-20',
      horaInicio: '18:00',
      horaFin: '20:00',
      motivo: 'Mantenimiento de luminarias',
    };

    it('TC-ESP08 · Criterio 6: advierte conflicto (409) si se superpone con un alquiler particular aprobado', async () => {
      mockPrisma.espacio.findUnique.mockResolvedValue({
        id: 1,
        nombre: 'Cancha 5',
        activo: true,
        disciplinas: [],
      });

      // Simular reserva aprobada en la misma fecha y horario
      // 2026-11-20 18:00 a 20:00 hora argentina = 21:00 a 23:00 UTC
      const resInicio = new Date('2026-11-20T21:00:00.000Z');
      const resFin = new Date('2026-11-20T23:00:00.000Z');

      mockPrisma.reserva.findMany.mockResolvedValue([
        {
          id: 50,
          codigo: 'RES-SEED01',
          inicio: resInicio,
          fin: resFin,
        },
      ]);

      await expect(service.agregarBloqueo(1, bloqueoPuntual, 99)).rejects.toThrow(
        new ConflictException(
          'El bloqueo entra en conflicto con la reserva particular aprobada RES-SEED01. Debe gestionar la cancelación manual justificada de la reserva antes de bloquear el turno.',
        ),
      );
    });

    it('TC-ESP09 · si no hay conflicto con alquileres, crea el bloqueo y lo audita', async () => {
      mockPrisma.espacio.findUnique.mockResolvedValue({
        id: 1,
        nombre: 'Cancha 5',
        activo: true,
        disciplinas: [],
      });
      mockPrisma.reserva.findMany.mockResolvedValue([]); // sin reservas que choquen
      mockPrisma.bloqueoAgenda.create.mockResolvedValue({
        id: 200,
        espacioId: 1,
        ...bloqueoPuntual,
      });

      const resultado = await service.agregarBloqueo(1, bloqueoPuntual, 99);

      expect(resultado.id).toBe(200);
      expect(mockAuditoria.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          accion: 'CREAR',
          entidad: 'BloqueoAgenda',
          idEntidad: 200,
        }),
        mockPrisma,
      );
    });

    it('TC-ESP10 · lanza 404 si el espacio no existe o está inactivo', async () => {
      mockPrisma.espacio.findUnique.mockResolvedValue(null);

      await expect(service.agregarBloqueo(999, bloqueoPuntual, 99)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('TC-ESP14 · Patrón Composite: al bloquear un espacio padre, detecta conflicto (409) si uno de sus sub-espacios hijos tiene reserva aprobada', async () => {
      mockPrisma.espacio.findUnique.mockResolvedValue({
        id: 10,
        nombre: 'Sector Parrillas Belgrano 245',
        activo: true,
        espacioPadreId: null,
        disciplinas: [],
        subespacios: [
          { id: 11, nombre: 'Parrilla 1' },
          { id: 15, nombre: 'Parrilla 5' },
        ],
      });

      const resInicio = new Date('2026-11-20T21:00:00.000Z');
      const resFin = new Date('2026-11-20T23:00:00.000Z');

      mockPrisma.reserva.findMany.mockResolvedValue([
        {
          id: 88,
          codigo: 'RES-PARR05',
          espacioId: 15,
          inicio: resInicio,
          fin: resFin,
        },
      ]);

      await expect(service.agregarBloqueo(10, bloqueoPuntual, 99)).rejects.toThrow(
        new ConflictException(
          'El bloqueo entra en conflicto con la reserva particular aprobada RES-PARR05. Debe gestionar la cancelación manual justificada de la reserva antes de bloquear el turno.',
        ),
      );
    });

    it('TC-ESP14b · Patrón Composite: al bloquear un sub-espacio hijo, detecta conflicto (409) si el espacio padre tiene reserva aprobada', async () => {
      mockPrisma.espacio.findUnique.mockResolvedValue({
        id: 15,
        nombre: 'Parrilla 5',
        activo: true,
        espacioPadreId: 10,
        disciplinas: [],
        subespacios: [],
      });

      const resInicio = new Date('2026-11-20T21:00:00.000Z');
      const resFin = new Date('2026-11-20T23:00:00.000Z');

      mockPrisma.reserva.findMany.mockResolvedValue([
        {
          id: 77,
          codigo: 'RES-PADRE10',
          espacioId: 10,
          inicio: resInicio,
          fin: resFin,
        },
      ]);

      await expect(service.agregarBloqueo(15, bloqueoPuntual, 99)).rejects.toThrow(
        new ConflictException(
          'El bloqueo entra en conflicto con la reserva particular aprobada RES-PADRE10. Debe gestionar la cancelación manual justificada de la reserva antes de bloquear el turno.',
        ),
      );
    });
  });

  describe('Consultas de espacios', () => {
    it('findAll · lista espacios aplicando filtros de búsqueda', async () => {
      mockPrisma.espacio.findMany.mockResolvedValue([
        { id: 1, nombre: 'Quincho Principal', tipo: TipoEspacio.SOCIAL },
      ]);

      const lista = await service.findAll({
        busqueda: 'Quincho',
        tipo: TipoEspacio.SOCIAL,
        activo: true,
      });

      expect(lista).toHaveLength(1);
      expect(mockPrisma.espacio.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tipo: TipoEspacio.SOCIAL,
            activo: true,
          }),
        }),
      );
    });

    it('findAll · soporta filtros soloRaiz y espacioPadreId (Patrón Composite)', async () => {
      mockPrisma.espacio.findMany.mockResolvedValue([]);

      await service.findAll({ soloRaiz: true });
      expect(mockPrisma.espacio.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            espacioPadreId: null,
          }),
        }),
      );

      await service.findAll({ espacioPadreId: 10 });
      expect(mockPrisma.espacio.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            espacioPadreId: 10,
          }),
        }),
      );
    });

    it('findAll · devuelve estructura paginada con counts (todos, activos, inactivos) cuando se envía pagina o estado', async () => {
      mockPrisma.espacio.findMany.mockResolvedValue([]);
      mockPrisma.espacio.count
        .mockResolvedValueOnce(0) // total del tab inactivos
        .mockResolvedValueOnce(3) // todos
        .mockResolvedValueOnce(3) // activos
        .mockResolvedValueOnce(0); // inactivos

      const res: any = await service.findAll({
        estado: 'inactivos',
        pagina: 1,
        porPagina: 10,
        ordenarPor: 'precio',
        orden: 'desc',
      });

      expect(res).toEqual({
        items: [],
        total: 0,
        pagina: 1,
        porPagina: 10,
        counts: {
          todos: 3,
          activos: 3,
          inactivos: 0,
        },
      });
    });

    it('findOne · devuelve detalle del espacio o 404 si no existe', async () => {
      mockPrisma.espacio.findUnique.mockResolvedValue({ id: 1, nombre: 'Cancha 1' });
      const espacio = await service.findOne(1);
      expect(espacio.id).toBe(1);

      mockPrisma.espacio.findUnique.mockResolvedValue(null);
      await expect(service.findOne(99)).rejects.toThrow(NotFoundException);
    });
  });

  describe('US-56 · Editar espacios y bloqueos', () => {
    it('TC-ESP-ED01 · modifica información, capacidad y tarifas de un espacio', async () => {
      mockPrisma.espacio.findUnique.mockResolvedValueOnce({
        id: 1,
        nombre: 'Cancha 1',
        tipo: TipoEspacio.DEPORTIVO,
        precio: new Prisma.Decimal(15000),
        montoSena: new Prisma.Decimal(5000),
        capacidadMaxima: 10,
        modalidad: ModalidadReserva.POR_HORA,
        activo: true,
        disciplinas: [{ disciplinaId: 1 }],
      });

      mockPrisma.disciplina.findMany.mockResolvedValueOnce([{ id: 1 }, { id: 2 }]);
      mockPrisma.espacio.update.mockResolvedValueOnce({
        id: 1,
        nombre: 'Cancha 1 Renovada',
        capacidadMaxima: 12,
        modalidad: ModalidadReserva.DIA_COMPLETO,
      });

      mockPrisma.espacio.findUniqueOrThrow.mockResolvedValueOnce({
        id: 1,
        nombre: 'Cancha 1 Renovada',
        capacidadMaxima: 12,
        modalidad: ModalidadReserva.DIA_COMPLETO,
        disciplinas: [],
        bloqueos: [],
      });

      const res = await service.update(
        1,
        {
          nombre: 'Cancha 1 Renovada',
          capacidadMaxima: 12,
          modalidad: ModalidadReserva.DIA_COMPLETO,
          disciplinaIds: [1, 2],
        },
        99,
      );

      expect(res.nombre).toBe('Cancha 1 Renovada');
      expect(mockAuditoria.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          accion: 'EDITAR',
          entidad: 'Espacio',
          idEntidad: 1,
          responsableId: 99,
        }),
        mockPrisma,
      );
    });

    it('TC-ESP-ED02 · rechaza con 400 si se intenta asociar disciplinas a un espacio SOCIAL', async () => {
      mockPrisma.espacio.findUnique.mockResolvedValueOnce({
        id: 2,
        nombre: 'Salón',
        tipo: TipoEspacio.SOCIAL,
        precio: new Prisma.Decimal(30000),
        montoSena: new Prisma.Decimal(10000),
        activo: true,
        disciplinas: [],
      });

      await expect(
        service.update(2, { disciplinaIds: [1] }, 99),
      ).rejects.toThrow(
        new BadRequestException('Los espacios de tipo SOCIAL no pueden asociarse a disciplinas deportivas.'),
      );
    });

    it('TC-ESP-ED03 · rechaza con 400 si montoSena > precio al editar', async () => {
      mockPrisma.espacio.findUnique.mockResolvedValueOnce({
        id: 1,
        nombre: 'Cancha 1',
        tipo: TipoEspacio.DEPORTIVO,
        precio: new Prisma.Decimal(15000),
        montoSena: new Prisma.Decimal(5000),
        activo: true,
        disciplinas: [],
      });

      await expect(
        service.update(1, { montoSena: 20000 }, 99),
      ).rejects.toThrow(
        new BadRequestException('El monto de la seña requerida no puede ser superior al precio total de alquiler.'),
      );
    });

    it('TC-ESP-ED04 · modifica un bloqueo y audita la acción', async () => {
      mockPrisma.espacio.findUnique.mockResolvedValueOnce({
        id: 1,
        nombre: 'Cancha 1',
        activo: true,
        disciplinas: [{ disciplinaId: 1 }],
        subespacios: [],
      });

      mockPrisma.bloqueoAgenda.findFirst.mockResolvedValueOnce({
        id: 50,
        espacioId: 1,
        tipo: TipoBloqueo.PUNTUAL,
        fecha: new Date('2026-11-20'),
        horaInicio: '10:00',
        horaFin: '12:00',
        motivo: 'Mantenimiento',
        activo: true,
      });

      mockPrisma.reserva.findMany.mockResolvedValueOnce([]);
      mockPrisma.bloqueoAgenda.update.mockResolvedValueOnce({
        id: 50,
        motivo: 'Mantenimiento general pintura',
        tipo: TipoBloqueo.PUNTUAL,
      });

      const res = await service.updateBloqueo(
        1,
        50,
        { motivo: 'Mantenimiento general pintura' },
        99,
      );

      expect(res.motivo).toBe('Mantenimiento general pintura');
      expect(mockAuditoria.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          accion: 'EDITAR',
          entidad: 'BloqueoAgenda',
          idEntidad: 50,
        }),
        mockPrisma,
      );
    });

    it('TC-ESP-ED04b · al editar un bloqueo del espacio padre, detecta conflicto (409) si un sub-espacio hijo tiene reserva aprobada', async () => {
      mockPrisma.espacio.findUnique.mockResolvedValueOnce({
        id: 10,
        nombre: 'Sector Parrillas',
        activo: true,
        disciplinas: [],
        subespacios: [{ id: 11, nombre: 'Parrilla 1', activo: true }],
      });

      mockPrisma.bloqueoAgenda.findFirst.mockResolvedValueOnce({
        id: 60,
        espacioId: 10,
        tipo: TipoBloqueo.PUNTUAL,
        fecha: new Date('2026-11-20'),
        horaInicio: '18:00',
        horaFin: '20:00',
        motivo: 'Mantenimiento',
        activo: true,
      });

      // Conflicto con reserva de Parrilla 1 (sub-espacio hijo)
      const resInicio = new Date('2026-11-20T21:00:00.000Z');
      const resFin = new Date('2026-11-20T23:00:00.000Z');
      mockPrisma.reserva.findMany.mockResolvedValueOnce([
        {
          id: 99,
          codigo: 'RES-PARR01',
          espacioId: 11,
          inicio: resInicio,
          fin: resFin,
        },
      ]);

      await expect(
        service.updateBloqueo(10, 60, { horaInicio: '18:00', horaFin: '20:00' }, 99),
      ).rejects.toThrow(
        new ConflictException(
          'El bloqueo modificado entra en conflicto con la reserva particular aprobada RES-PARR01. Debe gestionar la cancelación manual justificada de la reserva antes de bloquear el turno.',
        ),
      );
    });

    it('TC-ESP-ED05 · elimina lógicamente un bloqueo y audita la acción', async () => {
      mockPrisma.espacio.findUnique.mockResolvedValueOnce({
        id: 1,
        nombre: 'Cancha 1',
      });

      mockPrisma.bloqueoAgenda.findFirst.mockResolvedValueOnce({
        id: 50,
        espacioId: 1,
        tipo: TipoBloqueo.PUNTUAL,
        activo: true,
      });

      mockPrisma.bloqueoAgenda.update.mockResolvedValueOnce({
        id: 50,
        activo: false,
      });

      const res = await service.deleteBloqueo(1, 50, 99);
      expect(res.mensaje).toBe('Bloqueo eliminado exitosamente');
      expect(mockAuditoria.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          accion: 'BAJA',
          entidad: 'BloqueoAgenda',
          idEntidad: 50,
        }),
        mockPrisma,
      );
    });
  });

  describe('US-57 · Eliminar espacio (Baja Lógica)', () => {
    it('TC-ESP-DEL01 · aplica baja lógica al espacio y a sus sub-espacios si no hay reservas futuras', async () => {
      mockPrisma.espacio.findUnique.mockResolvedValueOnce({
        id: 10,
        nombre: 'Sector Parrillas',
        activo: true,
        subespacios: [{ id: 11, nombre: 'Parrilla 1' }],
      });

      mockPrisma.reserva.findMany.mockResolvedValueOnce([]); // Sin reservas futuras
      mockPrisma.espacio.update.mockResolvedValueOnce({ id: 10, activo: false });
      mockPrisma.espacio.updateMany.mockResolvedValueOnce({ count: 1 });
      mockPrisma.bloqueoAgenda.updateMany.mockResolvedValueOnce({ count: 0 });

      const res = await service.remove(10, 99);

      expect(res.mensaje).toBe('Espacio dado de baja exitosamente');
      expect(res.id).toBe(10);
      expect(mockPrisma.espacio.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 10 },
          data: { activo: false },
        }),
      );
      expect(mockPrisma.espacio.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { espacioPadreId: 10, activo: true },
          data: { activo: false },
        }),
      );
      expect(mockAuditoria.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          accion: 'BAJA',
          entidad: 'Espacio',
          idEntidad: 10,
          responsableId: 99,
        }),
        mockPrisma,
      );
    });

    it('TC-ESP-DEL02 · rechaza con 409 Conflict si el espacio tiene reservas futuras activas o pendientes', async () => {
      mockPrisma.espacio.findUnique.mockResolvedValueOnce({
        id: 10,
        nombre: 'Sector Parrillas',
        activo: true,
        subespacios: [],
      });

      mockPrisma.reserva.findMany.mockResolvedValueOnce([
        {
          id: 50,
          codigo: 'RES-FUTURA-01',
          inicio: new Date(Date.now() + 86400000),
          fin: new Date(Date.now() + 90000000),
          estado: 'CONFIRMADA',
        },
      ]);

      await expect(service.remove(10, 99)).rejects.toThrow(ConflictException);
    });

    it('TC-ESP-DEL03 · rechaza con 404 si el espacio no existe o ya está inactivo', async () => {
      mockPrisma.espacio.findUnique.mockResolvedValueOnce(null);
      await expect(service.remove(999, 99)).rejects.toThrow(NotFoundException);
    });
  });
});
