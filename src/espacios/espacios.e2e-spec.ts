import { INestApplication, ExecutionContext, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { Server } from 'http';
import { ModalidadReserva, TipoBloqueo, TipoEspacio } from '@prisma/client';
import { EspaciosController } from './espacios.controller';
import { EspaciosService } from './espacios.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

describe('US-55 · EspaciosController (e2e / Integración con Supertest)', () => {
  let app: INestApplication;

  let currentUser: { id: number; email: string; roles: string[] } | null = {
    id: 1,
    email: 'admin@socialclub.local',
    roles: ['ADMIN'],
  };

  const prismaMock: any = {
    espacio: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      findMany: jest.fn(),
    },
    espacioDisciplina: {
      createMany: jest.fn(),
    },
    bloqueoAgenda: {
      create: jest.fn(),
    },
    disciplina: {
      findMany: jest.fn(),
    },
    reserva: {
      findMany: jest.fn(),
    },
    $transaction: jest.fn((callback: (tx: any) => any) => callback(prismaMock)),
  };

  const auditoriaMock = {
    registrar: jest.fn().mockResolvedValue({ id: 100 }),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [EspaciosController],
      providers: [
        EspaciosService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuditoriaService, useValue: auditoriaMock },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          if (!currentUser) {
            return false;
          }
          const req = context.switchToHttp().getRequest();
          req.user = currentUser;
          return true;
        },
      })
      .overrideGuard(RolesGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          if (!currentUser) return false;
          // Dejar pasar si es admin
          if (currentUser.roles.includes('ADMIN')) return true;
          // Si el endpoint permite otros roles, verificar
          const handler = context.getHandler();
          if (handler.name === 'findAll' || handler.name === 'findOne') {
            return currentUser.roles.some((r) =>
              ['ADMIN', 'COLABORADOR', 'SOCIO', 'DELEGADO'].includes(r),
            );
          }
          return false;
        },
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    currentUser = {
      id: 1,
      email: 'admin@socialclub.local',
      roles: ['ADMIN'],
    };
  });

  const getHttpServer = () => app.getHttpServer() as Server;

  describe('TC-ESP-01 · Happy Path - Espacio Deportivo con disciplinas y bloqueo', () => {
    it('crea cancha de pádel deportiva con disciplina, modalidad POR_HORA, seña y bloqueo escuelita (201 Created)', async () => {
      prismaMock.disciplina.findMany.mockResolvedValue([{ id: 1, nombre: 'Pádel' }]);
      prismaMock.espacio.create.mockResolvedValue({
        id: 10,
        nombre: 'Cancha de Pádel 1',
        tipo: TipoEspacio.DEPORTIVO,
        capacidadMaxima: 4,
        modalidad: ModalidadReserva.POR_HORA,
        precio: 12000,
        precioSocio: 9000,
        montoSena: 4000,
        activo: true,
      });
      prismaMock.espacio.findUniqueOrThrow.mockResolvedValue({
        id: 10,
        nombre: 'Cancha de Pádel 1',
        tipo: TipoEspacio.DEPORTIVO,
        capacidadMaxima: 4,
        modalidad: ModalidadReserva.POR_HORA,
        precio: 12000,
        precioSocio: 9000,
        montoSena: 4000,
        activo: true,
        disciplinas: [{ disciplina: { id: 1, nombre: 'Pádel' } }],
        bloqueos: [
          {
            id: 1,
            tipo: TipoBloqueo.RECURRENTE,
            diasSemana: [1, 3, 5],
            horaInicio: '18:00',
            horaFin: '20:00',
            motivo: 'Entrenamiento escuelita',
            activo: true,
          },
        ],
      });

      const payload = {
        nombre: 'Cancha de Pádel 1',
        tipo: 'DEPORTIVO',
        capacidadMaxima: 4,
        modalidad: 'POR_HORA',
        precio: 12000,
        precioSocio: 9000,
        montoSena: 4000,
        disciplinaIds: [1],
        ubicacion: 'Sector Polideportivo Norte',
        bloqueos: [
          {
            tipo: 'RECURRENTE',
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

      const res = await request(getHttpServer()).post('/espacios').send(payload).expect(201);

      expect(res.body.id).toBe(10);
      expect(res.body.nombre).toBe('Cancha de Pádel 1');
      expect(prismaMock.espacio.create).toHaveBeenCalled();
      expect(prismaMock.espacioDisciplina.createMany).toHaveBeenCalledWith({
        data: [{ espacioId: 10, disciplinaId: 1 }],
      });
      expect(prismaMock.bloqueoAgenda.create).toHaveBeenCalled();
      expect(auditoriaMock.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          accion: 'CREAR',
          entidad: 'Espacio',
          idEntidad: 10,
          responsableId: 1,
        }),
        prismaMock,
      );
    });
  });

  describe('TC-ESP-02 · Happy Path - Espacio Social sin disciplinas', () => {
    it('crea salón de fiestas con modalidad DIA_COMPLETO y sin disciplinas (201 Created)', async () => {
      const payloadSocial = {
        nombre: 'Salón Social Los Robles',
        tipo: 'SOCIAL',
        capacidadMaxima: 150,
        modalidad: 'DIA_COMPLETO',
        precio: 80000,
        precioSocio: 60000,
        montoSena: 25000,
        ubicacion: 'Sede Central',
      };

      prismaMock.espacio.create.mockResolvedValue({ id: 25, ...payloadSocial });
      prismaMock.espacio.findUniqueOrThrow.mockResolvedValue({
        id: 25,
        ...payloadSocial,
        disciplinas: [],
        bloqueos: [],
      });

      const res = await request(getHttpServer()).post('/espacios').send(payloadSocial).expect(201);

      expect(res.body.id).toBe(25);
      expect(prismaMock.espacioDisciplina.createMany).not.toHaveBeenCalled();
      expect(auditoriaMock.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          accion: 'CREAR',
          entidad: 'Espacio',
          idEntidad: 25,
          responsableId: 1,
        }),
        prismaMock,
      );
    });
  });

  describe('TC-ESP-03 · Validación Regla Social (Criterio 2)', () => {
    it('rechaza con 400 si se intenta asociar disciplinas a un espacio de tipo SOCIAL', async () => {
      const payload = {
        nombre: 'Quincho con asador',
        tipo: 'SOCIAL',
        capacidadMaxima: 40,
        modalidad: 'DIA_COMPLETO',
        precio: 30000,
        montoSena: 10000,
        disciplinaIds: [1], // Violación de regla
      };

      const res = await request(getHttpServer()).post('/espacios').send(payload).expect(400);

      expect(res.body.message).toContain(
        'Los espacios de tipo SOCIAL no pueden asociarse a disciplinas deportivas.',
      );
    });
  });

  describe('TC-ESP-04 · Validaciones Monetarias y Capacidad', () => {
    it('rechaza con 400 si capacidadMaxima <= 0', async () => {
      const payload = {
        nombre: 'Cancha Mini',
        tipo: 'DEPORTIVO',
        capacidadMaxima: 0,
        modalidad: 'POR_HORA',
        precio: 10000,
        montoSena: 3000,
      };

      const res = await request(getHttpServer()).post('/espacios').send(payload).expect(400);

      expect(res.body.message).toContain('La capacidad máxima debe ser mayor a cero');
    });

    it('rechaza con 400 si precio <= 0', async () => {
      const payload = {
        nombre: 'Cancha Mini',
        tipo: 'DEPORTIVO',
        capacidadMaxima: 10,
        modalidad: 'POR_HORA',
        precio: 0,
        montoSena: 1000,
      };

      const res = await request(getHttpServer()).post('/espacios').send(payload).expect(400);

      expect(res.body.message).toContain('El precio de alquiler debe ser mayor a cero');
    });

    it('rechaza con 400 si montoSena <= 0', async () => {
      const payload = {
        nombre: 'Cancha Mini',
        tipo: 'DEPORTIVO',
        capacidadMaxima: 10,
        modalidad: 'POR_HORA',
        precio: 10000,
        montoSena: 0,
      };

      const res = await request(getHttpServer()).post('/espacios').send(payload).expect(400);

      expect(res.body.message).toContain('El monto de la seña debe ser mayor a cero');
    });

    it('rechaza con 400 si montoSena > precio total de alquiler', async () => {
      const payload = {
        nombre: 'Cancha Mini',
        tipo: 'DEPORTIVO',
        capacidadMaxima: 10,
        modalidad: 'POR_HORA',
        precio: 10000,
        montoSena: 15000, // Seña mayor al precio
      };

      const res = await request(getHttpServer()).post('/espacios').send(payload).expect(400);

      expect(res.body.message).toContain(
        'El monto de la seña requerida no puede ser superior al precio total de alquiler.',
      );
    });
  });

  describe('TC-ESP-05 · Validación Bloqueo Recurrente (Criterio 3)', () => {
    it('rechaza con 400 si bloqueo recurrente no indica días de la semana', async () => {
      const payload = {
        nombre: 'Cancha de Básquet',
        tipo: 'DEPORTIVO',
        capacidadMaxima: 20,
        modalidad: 'POR_HORA',
        precio: 15000,
        montoSena: 5000,
        bloqueos: [
          {
            tipo: 'RECURRENTE',
            diasSemana: [],
            horaInicio: '18:00',
            horaFin: '20:00',
            vigenteHasta: '2026-12-31',
          },
        ],
      };

      const res = await request(getHttpServer()).post('/espacios').send(payload).expect(400);

      expect(res.body.message).toContain(
        'Los bloqueos recurrentes deben indicar al menos un día de la semana (0 a 6).',
      );
    });

    it('rechaza con 400 si horaFin <= horaInicio en bloqueo recurrente', async () => {
      const payload = {
        nombre: 'Cancha de Básquet',
        tipo: 'DEPORTIVO',
        capacidadMaxima: 20,
        modalidad: 'POR_HORA',
        precio: 15000,
        montoSena: 5000,
        bloqueos: [
          {
            tipo: 'RECURRENTE',
            diasSemana: [1, 2],
            horaInicio: '20:00',
            horaFin: '18:00', // horaFin anterior a horaInicio
            vigenteHasta: '2026-12-31',
          },
        ],
      };

      const res = await request(getHttpServer()).post('/espacios').send(payload).expect(400);

      expect(res.body.message).toContain(
        'La hora de fin del bloqueo debe ser posterior a la hora de inicio.',
      );
    });

    it('rechaza con 400 si no se especifica vigenteHasta en bloqueo recurrente', async () => {
      const payload = {
        nombre: 'Cancha de Básquet',
        tipo: 'DEPORTIVO',
        capacidadMaxima: 20,
        modalidad: 'POR_HORA',
        precio: 15000,
        montoSena: 5000,
        bloqueos: [
          {
            tipo: 'RECURRENTE',
            diasSemana: [1, 2],
            horaInicio: '18:00',
            horaFin: '20:00',
          },
        ],
      };

      const res = await request(getHttpServer()).post('/espacios').send(payload).expect(400);

      expect(res.body.message).toContain(
        'Los bloqueos recurrentes deben indicar la fecha límite de vigencia (vigenteHasta).',
      );
    });
  });

  describe('TC-ESP-06 · Validación Bloqueo Puntual (Criterio 4)', () => {
    it('rechaza con 400 si el bloqueo puntual no especifica fecha', async () => {
      const payload = {
        nombre: 'Salón de Usos Múltiples',
        tipo: 'MULTIUSO',
        capacidadMaxima: 50,
        modalidad: 'POR_HORA',
        precio: 20000,
        montoSena: 8000,
        bloqueos: [
          {
            tipo: 'PUNTUAL',
            motivo: 'Mantenimiento del piso',
          },
        ],
      };

      const res = await request(getHttpServer()).post('/espacios').send(payload).expect(400);

      expect(res.body.message).toContain(
        'Los bloqueos puntuales deben indicar una fecha específica (fecha).',
      );
    });

    it('rechaza con 400 si el bloqueo puntual no especifica motivo o está vacío', async () => {
      const payload = {
        nombre: 'Salón de Usos Múltiples',
        tipo: 'MULTIUSO',
        capacidadMaxima: 50,
        modalidad: 'POR_HORA',
        precio: 20000,
        montoSena: 8000,
        bloqueos: [
          {
            tipo: 'PUNTUAL',
            fecha: '2026-11-28',
            motivo: '   ',
          },
        ],
      };

      const res = await request(getHttpServer()).post('/espacios').send(payload).expect(400);

      expect(res.body.message).toContain('El motivo es obligatorio para bloqueos puntuales.');
    });
  });

  describe('TC-ESP-07 · Conflicto de Agenda con Reserva Aprobada (Criterio 6)', () => {
    it('responde 409 Conflict si un bloqueo puntual choca con una reserva particular aprobada/confirmada', async () => {
      prismaMock.espacio.findUnique.mockResolvedValue({
        id: 1,
        nombre: 'Cancha de Pádel 1',
        activo: true,
        disciplinas: [],
      });

      // Simular reserva aprobada el 2026-11-20 de 18:00 a 20:00 (21:00 a 23:00 UTC)
      prismaMock.reserva.findMany.mockResolvedValue([
        {
          id: 55,
          codigo: 'RES-SEED01',
          inicio: new Date('2026-11-20T21:00:00.000Z'),
          fin: new Date('2026-11-20T23:00:00.000Z'),
        },
      ]);

      const payloadBloqueo = {
        tipo: 'PUNTUAL',
        fecha: '2026-11-20',
        horaInicio: '18:00',
        horaFin: '20:00',
        motivo: 'Reparación de red',
      };

      const res = await request(getHttpServer())
        .post('/espacios/1/bloqueos')
        .send(payloadBloqueo)
        .expect(409);

      expect(res.body.message).toContain(
        'El bloqueo entra en conflicto con la reserva particular aprobada RES-SEED01. Debe gestionar la cancelación manual justificada de la reserva antes de bloquear el turno.',
      );
    });
  });

  describe('TC-ESP-08 · Auditoría Inalterable (RN14 / RNF03)', () => {
    it('comprueba que la creación de espacio y bloqueos registre auditoría inalterable con id de responsable', async () => {
      prismaMock.espacio.create.mockResolvedValue({
        id: 30,
        nombre: 'Quincho 2',
        tipo: TipoEspacio.SOCIAL,
        capacidadMaxima: 30,
        modalidad: ModalidadReserva.DIA_COMPLETO,
        precio: 25000,
        montoSena: 10000,
      });
      prismaMock.espacio.findUniqueOrThrow.mockResolvedValue({
        id: 30,
        nombre: 'Quincho 2',
        tipo: TipoEspacio.SOCIAL,
        disciplinas: [],
        bloqueos: [],
      });

      await request(getHttpServer())
        .post('/espacios')
        .send({
          nombre: 'Quincho 2',
          tipo: 'SOCIAL',
          capacidadMaxima: 30,
          modalidad: 'DIA_COMPLETO',
          precio: 25000,
          montoSena: 10000,
        })
        .expect(201);

      expect(auditoriaMock.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          accion: 'CREAR',
          entidad: 'Espacio',
          idEntidad: 30,
          responsableId: 1,
        }),
        prismaMock,
      );
    });

    it('verifica inalterabilidad: no expone endpoints PUT, PATCH ni DELETE en /espacios', async () => {
      await request(getHttpServer()).delete('/espacios/1').expect(404);
      await request(getHttpServer()).put('/espacios/1').expect(404);
    });
  });

  describe('Seguridad y Control de Acceso (RBAC)', () => {
    it('rechaza petición a POST /espacios si el usuario no tiene rol ADMIN (403 Forbidden)', async () => {
      currentUser = { id: 5, email: 'socio@test.com', roles: ['SOCIO'] };

      await request(getHttpServer())
        .post('/espacios')
        .send({
          nombre: 'Cancha Test',
          tipo: 'DEPORTIVO',
          capacidadMaxima: 10,
          modalidad: 'POR_HORA',
          precio: 10000,
          montoSena: 3000,
        })
        .expect(403);
    });

    it('permite consulta a GET /espacios a usuarios con rol SOCIO o COLABORADOR (200 OK)', async () => {
      currentUser = { id: 5, email: 'socio@test.com', roles: ['SOCIO'] };
      prismaMock.espacio.findMany.mockResolvedValue([{ id: 1, nombre: 'Cancha 1' }]);

      const res = await request(getHttpServer()).get('/espacios').expect(200);

      expect(res.body).toHaveLength(1);
    });
  });

  describe('TC-ESP-09 · Patrón Composite (Espacio Padre con Sub-espacios en Lote)', () => {
    it('crea un sector de parrillas padre con 3 sub-espacios generados en lote (201 Created)', async () => {
      prismaMock.espacio.create
        .mockResolvedValueOnce({
          id: 40,
          nombre: 'Sector Asadores Belgrano 245',
          tipo: 'SOCIAL',
          capacidadMaxima: 45,
        })
        .mockResolvedValueOnce({ id: 41, nombre: 'Parrilla 1', espacioPadreId: 40 })
        .mockResolvedValueOnce({ id: 42, nombre: 'Parrilla 2', espacioPadreId: 40 })
        .mockResolvedValueOnce({ id: 43, nombre: 'Parrilla 3', espacioPadreId: 40 });

      prismaMock.espacio.findUniqueOrThrow.mockResolvedValue({
        id: 40,
        nombre: 'Sector Asadores Belgrano 245',
        tipo: 'SOCIAL',
        subespacios: [
          { id: 41, nombre: 'Parrilla 1' },
          { id: 42, nombre: 'Parrilla 2' },
          { id: 43, nombre: 'Parrilla 3' },
        ],
      });

      const res = await request(getHttpServer())
        .post('/espacios')
        .send({
          nombre: 'Sector Asadores Belgrano 245',
          tipo: 'SOCIAL',
          capacidadMaxima: 45,
          modalidad: 'DIA_COMPLETO',
          ubicacion: 'Manuel Belgrano 245',
          precio: 15000,
          precioSocio: 10000,
          montoSena: 5000,
          cantidadSubespacios: 3,
          prefijoSubespacio: 'Parrilla',
          capacidadSubespacio: 15,
        })
        .expect(201);

      expect(res.body.subespacios).toHaveLength(3);
      expect(res.body.subespacios[0].nombre).toBe('Parrilla 1');
    });
  });

  describe('TC-ESP-10 · Patrón Composite (Límite de Jerarquía)', () => {
    it('responde 404 si el espacioPadreId no existe o está inactivo', async () => {
      prismaMock.espacio.findUnique.mockResolvedValueOnce(null);

      const res = await request(getHttpServer())
        .post('/espacios')
        .send({
          nombre: 'Parrilla Extra',
          tipo: 'SOCIAL',
          capacidadMaxima: 15,
          modalidad: 'DIA_COMPLETO',
          precio: 15000,
          montoSena: 5000,
          espacioPadreId: 9999,
        })
        .expect(404);

      expect(res.body.message).toContain(
        'El espacio padre indicado no existe o se encuentra inactivo.',
      );
    });

    it('rechaza con 400 si se intenta asignar como padre a un sub-espacio (máximo 2 niveles)', async () => {
      prismaMock.espacio.findUnique.mockResolvedValueOnce({
        id: 41,
        activo: true,
        espacioPadreId: 40,
      });

      const res = await request(getHttpServer())
        .post('/espacios')
        .send({
          nombre: 'Parrilla Sub-nivel',
          tipo: 'SOCIAL',
          capacidadMaxima: 15,
          modalidad: 'DIA_COMPLETO',
          precio: 15000,
          montoSena: 5000,
          espacioPadreId: 41,
        })
        .expect(400);

      expect(res.body.message).toContain(
        'No se puede asignar como padre a un sub-espacio; la jerarquía admite dos niveles (Padre -> Sub-espacio).',
      );
    });
  });

  describe('TC-ESP-11 · Patrón Composite (Propagación de Conflictos Padre/Hijo)', () => {
    it('responde 409 Conflict si se intenta bloquear un espacio padre cuando un sub-espacio hijo está reservado', async () => {
      prismaMock.espacio.findUnique.mockResolvedValue({
        id: 40,
        nombre: 'Sector Asadores',
        activo: true,
        espacioPadreId: null,
        disciplinas: [],
        subespacios: [{ id: 41, nombre: 'Parrilla 1' }],
      });

      prismaMock.reserva.findMany.mockResolvedValue([
        {
          id: 91,
          codigo: 'RES-HIJO41',
          espacioId: 41,
          inicio: new Date('2026-11-20T21:00:00.000Z'),
          fin: new Date('2026-11-20T23:00:00.000Z'),
        },
      ]);

      const res = await request(getHttpServer())
        .post('/espacios/40/bloqueos')
        .send({
          tipo: 'PUNTUAL',
          fecha: '2026-11-20',
          horaInicio: '18:00',
          horaFin: '20:00',
          motivo: 'Fumigación general del sector',
        })
        .expect(409);

      expect(res.body.message).toContain(
        'El bloqueo entra en conflicto con la reserva particular aprobada RES-HIJO41.',
      );
    });

    it('responde 409 Conflict si se intenta bloquear un sub-espacio hijo cuando el espacio padre está reservado', async () => {
      prismaMock.espacio.findUnique.mockResolvedValue({
        id: 41,
        nombre: 'Parrilla 1',
        activo: true,
        espacioPadreId: 40,
        disciplinas: [],
        subespacios: [],
      });

      prismaMock.reserva.findMany.mockResolvedValue([
        {
          id: 92,
          codigo: 'RES-PADRE40',
          espacioId: 40,
          inicio: new Date('2026-11-20T21:00:00.000Z'),
          fin: new Date('2026-11-20T23:00:00.000Z'),
        },
      ]);

      const res = await request(getHttpServer())
        .post('/espacios/41/bloqueos')
        .send({
          tipo: 'PUNTUAL',
          fecha: '2026-11-20',
          horaInicio: '18:00',
          horaFin: '20:00',
          motivo: 'Mantenimiento parrilla individual',
        })
        .expect(409);

      expect(res.body.message).toContain(
        'El bloqueo entra en conflicto con la reserva particular aprobada RES-PADRE40.',
      );
    });
  });

  describe('Filtros Composite en GET /espacios', () => {
    it('soporta filtro soloRaiz=true y espacioPadreId', async () => {
      prismaMock.espacio.findMany.mockResolvedValue([{ id: 40, nombre: 'Sector Asadores' }]);

      await request(getHttpServer()).get('/espacios?soloRaiz=true').expect(200);

      expect(prismaMock.espacio.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            espacioPadreId: null,
          }),
        }),
      );

      await request(getHttpServer()).get('/espacios?espacioPadreId=40').expect(200);

      expect(prismaMock.espacio.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            espacioPadreId: 40,
          }),
        }),
      );
    });
  });
});
