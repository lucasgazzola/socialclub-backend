import { INestApplication, ExecutionContext, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { MembersController } from './members.controller';
import { MembersService } from './members.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

/**
 * Se armo un modulo de test acotado al feature de socios: MembersController + MembersService
 * reales, con PrismaService/AuditService mockeados
 */
describe('MembersController (e2e)', () => {
  let app: INestApplication;
  let httpServer: Parameters<typeof request>[0];

  const prismaMock = {
    person: {
      findUnique: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const auditMock = { record: jest.fn() };

  const usuarioAdminMock = { id: 99, email: 'admin@club.com', roles: ['ADMIN'] };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [MembersController],
      providers: [
        MembersService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuditService, useValue: auditMock },
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
  });

  describe('TC-023: persistencia del socio vía API', () => {
    it('POST /socios crea el socio y luego GET /socios lo devuelve con los mismos datos', async () => {
      const nuevoSocio = {
        name: 'Carla',
        lastName: 'Fernandez',
        dni: '35222111',
        email: 'carla.fernandez@example.com',
        phone: '351 555 1212',
        birthDate: '1995-03-10',
      };

      const socioPersistido = {
        id: 55,
        ...nuevoSocio,
        birthDate: new Date(nuevoSocio.birthDate),
        active: true,
        category: null,
      };

      prismaMock.person.findUnique.mockResolvedValue(null);
      prismaMock.person.create.mockResolvedValue(socioPersistido);

      const postResponse = await request(httpServer).post('/socios').send(nuevoSocio).expect(201);

      expect(postResponse.body).toEqual(
        expect.objectContaining({ id: 55, dni: nuevoSocio.dni, name: nuevoSocio.name }),
      );
      expect(auditMock.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CREATE', entity: 'Person', responsibleId: 99 }),
      );

      prismaMock.$transaction.mockResolvedValue([[socioPersistido], 1]);

      const getResponse = await request(httpServer)
        .get('/socios')
        .query({ search: nuevoSocio.dni, page: 1, perPage: 10 })
        .expect(200);

      expect(getResponse.body.items).toContainEqual(
        expect.objectContaining({ dni: nuevoSocio.dni, name: nuevoSocio.name }),
      );
    });
  });

  describe('TC-020: DNI duplicado vía API', () => {
    it('POST /socios devuelve 409 y no llama a auditoría cuando el DNI ya existe', async () => {
      prismaMock.person.findUnique.mockResolvedValue({ id: 1, dni: '30111222' });

      await request(httpServer)
        .post('/socios')
        .send({ name: 'Otro', lastName: 'Socio', dni: '30111222' })
        .expect(409);

      expect(auditMock.record).not.toHaveBeenCalled();
    });
  });

  describe('Autorización (guards)', () => {
    it('GET /socios responde 200 para un usuario ADMIN simulado', async () => {
      prismaMock.$transaction.mockResolvedValue([[], 0]);

      await request(httpServer).get('/socios').query({ page: 1, perPage: 10 }).expect(200);
    });
  });
});
