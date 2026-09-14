import { INestApplication, ExecutionContext, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { SociosController } from './socios.controller';
import { SociosService } from './socios.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

/**
 * Se armo un modulo de test acotado al feature de socios: SociosController + SociosService
 * reales, con PrismaService/AuditoriaService mockeados
 */
describe('SociosController (e2e)', () => {
  let app: INestApplication;
  let httpServer: Parameters<typeof request>[0];

  const prismaMock: any = {
    persona: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    categoriaSocio: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    membresia: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn((arg: any) => (typeof arg === 'function' ? arg(prismaMock) : arg)),
  };

  const auditoriaMock = { registrar: jest.fn() };

  const usuarioAdminMock = { id: 99, email: 'admin@club.com', roles: ['ADMIN'] };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [SociosController],
      providers: [
        SociosService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuditoriaService, useValue: auditoriaMock },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const req = context.switchToHttp().getRequest();
          req.user = usuarioAdminMock;
          return true;
        },
      })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    httpServer = app.getHttpServer() as Parameters<typeof request>[0];
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.$transaction.mockImplementation((arg: any) =>
      typeof arg === 'function' ? arg(prismaMock) : arg,
    );
    prismaMock.categoriaSocio.findUnique.mockResolvedValue({ id: 1, nombre: 'Mayores' });
    prismaMock.categoriaSocio.findFirst.mockResolvedValue({ id: 1, nombre: 'Mayores' });
  });

  describe('TC-023: persistencia del socio vía API', () => {
    it('POST /socios crea el socio y luego GET /socios lo devuelve con los mismos datos', async () => {
      const nuevoSocio = {
        nombre: 'Carla',
        apellido: 'Fernandez',
        dni: '35222111',
        email: 'carla.fernandez@example.com',
        telefono: '351 555 1212',
        fechaNacimiento: '1995-03-10',
      };

      const socioPersistido = {
        id: 55,
        ...nuevoSocio,
        fechaNacimiento: new Date(nuevoSocio.fechaNacimiento),
        creadoEn: new Date(),
        actualizadoEn: new Date(),
        membresias: [
          {
            id: 1,
            categoriaId: 1,
            categoria: { id: 1, nombre: 'Mayores' },
            activo: true,
            fechaAlta: new Date(),
            fechaBaja: null,
          },
        ],
        usuario: null,
      };

      prismaMock.persona.findUnique.mockResolvedValue(null);
      prismaMock.persona.findFirst.mockResolvedValue(null);
      prismaMock.persona.create.mockResolvedValue(socioPersistido);

      const postResponse = await request(httpServer).post('/socios').send(nuevoSocio).expect(201);

      expect(postResponse.body).toEqual(
        expect.objectContaining({ id: 55, dni: nuevoSocio.dni, nombre: nuevoSocio.nombre }),
      );
      expect(auditoriaMock.registrar).toHaveBeenCalledWith(
        expect.objectContaining({ accion: 'CREAR', responsableId: 99 }),
        expect.anything(),
      );

      prismaMock.$transaction.mockResolvedValue([[socioPersistido], 1]);

      const getResponse = await request(httpServer)
        .get('/socios')
        .query({ busqueda: nuevoSocio.dni, pagina: 1, porPagina: 10 })
        .expect(200);

      expect(getResponse.body.items).toContainEqual(
        expect.objectContaining({ dni: nuevoSocio.dni, nombre: nuevoSocio.nombre }),
      );
    });
  });

  describe('TC-020: DNI duplicado vía API', () => {
    it('POST /socios devuelve 409 y no llama a auditoría cuando el DNI ya existe', async () => {
      prismaMock.persona.findUnique.mockResolvedValue({
        id: 1,
        dni: '30111222',
        membresias: [{ id: 1, activo: true }],
      });

      await request(httpServer)
        .post('/socios')
        .send({ nombre: 'Otro', apellido: 'Socio', dni: '30111222' })
        .expect(409);

      expect(auditoriaMock.registrar).not.toHaveBeenCalled();
    });
  });

  describe('Autorización (guards)', () => {
    it('GET /socios responde 200 para un usuario ADMIN simulado', async () => {
      prismaMock.$transaction.mockResolvedValue([[], 0]);

      await request(httpServer).get('/socios').query({ pagina: 1, porPagina: 10 }).expect(200);
    });
  });
});
