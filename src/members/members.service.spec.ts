import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MembersService } from './members.service';

/**
 * Casos cubiertos:
 * - TC-019: Registrar un nuevo socio con datos validos
 * - TC-020: Validar que no se pueda registrar un socio con DNI duplicado
 * - TC-023: Verificar persistencia del socio (a nivel service/DB simulada)
 * - TC-024: Confirmar rol "Socio" asignado -> ver nota al final del archivo
 */
describe('MembersService', () => {
  let service: MembersService;

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

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        MembersService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuditService, useValue: auditMock },
      ],
    }).compile();

    service = moduleRef.get(MembersService);
  });

  describe('TC-019: registrar un nuevo socio con datos válidos', () => {
    it('crea el socio, lo persiste con todos los datos ingresados y deja constancia en auditoría', async () => {
      const dto = {
        name: 'Lucas',
        lastName: 'Gazzola',
        dni: '40123456',
        email: 'lucas.gazzola@example.com',
        phone: '351 123 4567',
        birthDate: '1998-05-20',
        categoryId: 1,
      };

      const categoria = { id: 1, name: 'Activo' };
      const socioCreado = {
        id: 10,
        ...dto,
        birthDate: new Date(dto.birthDate),
        active: true,
        categoria,
      };

      prismaMock.person.findUnique.mockResolvedValue(null);
      prismaMock.person.create.mockResolvedValue(socioCreado);

      const resultado = await service.create(dto, 99);

      // Se persiste con los datos ingresados
      expect(prismaMock.person.create).toHaveBeenCalledWith({
        data: {
          name: dto.name,
          lastName: dto.lastName,
          dni: dto.dni,
          email: dto.email,
          phone: dto.phone,
          categoryId: dto.categoryId,
          birthDate: new Date(dto.birthDate),
        },
        include: { category: true },
      });

      expect(resultado).toEqual(socioCreado);

      // Queda constancia en audit
      expect(auditMock.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CREATE',
          entity: 'Person',
          entityId: socioCreado.id,
          responsibleId: 99,
        }),
      );
    });

    it('permite registrar un socio sin birthDate (campo opcional)', async () => {
      const dto = { name: 'Ana', lastName: 'Diaz', dni: '30999888' };

      prismaMock.person.findUnique.mockResolvedValue(null);
      prismaMock.person.create.mockResolvedValue({ id: 11, ...dto, category: null });

      await service.create(dto, 1);

      expect(prismaMock.person.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ birthDate: undefined }),
        }),
      );
    });
  });

  describe('TC-020: DNI duplicado', () => {
    it('rechaza el alta y no llama a create ni a auditoría cuando el DNI ya existe', async () => {
      prismaMock.person.findUnique.mockResolvedValue({ id: 1, dni: '30111222' });

      await expect(
        service.create({ name: 'Otro', lastName: 'Socio', dni: '30111222' }, 99),
      ).rejects.toBeInstanceOf(ConflictException);

      await expect(
        service.create({ name: 'Otro', lastName: 'Socio', dni: '30111222' }, 99),
      ).rejects.toThrow('Ya existe una persona registrada con ese DNI');

      expect(prismaMock.person.create).not.toHaveBeenCalled();
      expect(auditMock.record).not.toHaveBeenCalled();
    });
  });

  describe('TC-023: persistencia y aparición en el listado', () => {
    it('el socio creado aparece luego al consultar findAll con sus datos', async () => {
      const dto = { name: 'Marta', lastName: 'Lopez', dni: '27888999' };
      const socioCreado = {
        id: 20,
        ...dto,
        email: null,
        phone: null,
        active: true,
        category: null,
      };

      prismaMock.person.findUnique.mockResolvedValue(null);
      prismaMock.person.create.mockResolvedValue(socioCreado);

      const creado = await service.create(dto, 1);

      // Simulamos que el registro recien creado ya esta en la "base" para el listado
      prismaMock.$transaction.mockResolvedValue([[socioCreado], 1]);

      const listado = await service.findAll({
        page: 1,
        perPage: 10,
      });

      expect(listado.items).toContainEqual(
        expect.objectContaining({ id: creado.id, dni: dto.dni, name: dto.name }),
      );
      expect(listado.total).toBe(1);
    });
  });

  /**
   * TC-024: Confirmar que el socio quede asociado al rol correspondiente ("Socio").
   *
   * Persona (lo que crea MembersService.create) NO tiene
   * ningun campo de rol. Los roles del sistema (ADMIN, COLLABORATOR) estan
   * modelados sobre `Usuario` vía la tabla intermedia
   * `UsuarioRol` — y `Usuario` es una entidad distinta de `Persona` (login vs.
   * "alguien gestionado por el club").
   */
  it.todo(
    'TC-024: el socio creado queda asociado al rol "Socio" — requiere decisión de producto, ver comentario arriba (Persona no tiene rol; los roles solo existen en Usuario/UsuarioRol)',
  );
});
