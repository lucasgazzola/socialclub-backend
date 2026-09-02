import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { SociosService } from './socios.service';

/**
 * Casos cubiertos:
 * - TC-019: Registrar un nuevo socio con datos validos
 * - TC-020: Validar que no se pueda registrar un socio con DNI duplicado
 * - TC-023: Verificar persistencia del socio (a nivel service/DB simulada)
 * - TC-024: Confirmar rol "Socio" asignado -> ver nota al final del archivo
 */
describe('SociosService', () => {
  let service: SociosService;

  const prismaMock: any = {
    persona: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    usuario: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    usuarioRol: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    rol: {
      findUnique: jest.fn(),
    },
    categoriaSocio: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn((arg: any) => (typeof arg === 'function' ? arg(prismaMock) : arg)),
  };

  const auditoriaMock = { registrar: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    prismaMock.$transaction.mockImplementation((arg: any) =>
      typeof arg === 'function' ? arg(prismaMock) : arg,
    );
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        SociosService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuditoriaService, useValue: auditoriaMock },
      ],
    }).compile();

    service = moduleRef.get(SociosService);
  });

  describe('TC-019: registrar un nuevo socio con datos válidos', () => {
    it('crea el socio, lo persiste con todos los datos ingresados y deja constancia en auditoría', async () => {
      const dto = {
        nombre: 'Lucas',
        apellido: 'Gazzola',
        dni: '40123456',
        email: 'lucas.gazzola@example.com',
        telefono: '351 123 4567',
        fechaNacimiento: '1998-05-20',
        categoriaId: 1,
      };

      const categoria = { id: 1, nombre: 'Activo' };
      const socioCreado = {
        id: 10,
        ...dto,
        fechaNacimiento: new Date(dto.fechaNacimiento),
        activo: true,
        categoria,
      };

      prismaMock.persona.findUnique.mockResolvedValue(null);
      prismaMock.persona.create.mockResolvedValue(socioCreado);

      const resultado = await service.create(dto, 99);

      // Se persiste con los datos ingresados
      expect(prismaMock.persona.create).toHaveBeenCalledWith({
        data: {
          nombre: dto.nombre,
          apellido: dto.apellido,
          dni: dto.dni,
          email: dto.email,
          telefono: dto.telefono,
          categoriaId: dto.categoriaId,
          fechaNacimiento: new Date(dto.fechaNacimiento),
        },
        include: { categoria: true },
      });

      expect(resultado).toEqual(socioCreado);

      // Queda constancia en auditoria
      expect(auditoriaMock.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          accion: 'CREAR',
          entidad: 'Persona',
          idEntidad: socioCreado.id,
          responsableId: 99,
        }),
      );
    });

    it('permite registrar un socio sin fechaNacimiento (campo opcional)', async () => {
      const dto = { nombre: 'Ana', apellido: 'Diaz', dni: '30999888' };

      prismaMock.persona.findUnique.mockResolvedValue(null);
      prismaMock.persona.create.mockResolvedValue({ id: 11, ...dto, categoria: null });

      await service.create(dto, 1);

      expect(prismaMock.persona.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ fechaNacimiento: undefined }),
        }),
      );
    });
  });

  describe('TC-020: DNI duplicado', () => {
    it('rechaza el alta y no llama a create ni a auditoría cuando el DNI ya existe', async () => {
      prismaMock.persona.findUnique.mockResolvedValue({ id: 1, dni: '30111222' });

      await expect(
        service.create({ nombre: 'Otro', apellido: 'Socio', dni: '30111222' }, 99),
      ).rejects.toBeInstanceOf(ConflictException);

      await expect(
        service.create({ nombre: 'Otro', apellido: 'Socio', dni: '30111222' }, 99),
      ).rejects.toThrow('Ya existe una persona registrada con ese DNI');

      expect(prismaMock.persona.create).not.toHaveBeenCalled();
      expect(auditoriaMock.registrar).not.toHaveBeenCalled();
    });
  });

  describe('TC-023: persistencia y aparición en el listado', () => {
    it('el socio creado aparece luego al consultar findAll con sus datos', async () => {
      const dto = { nombre: 'Marta', apellido: 'Lopez', dni: '27888999' };
      const socioCreado = {
        id: 20,
        ...dto,
        email: null,
        telefono: null,
        activo: true,
        categoria: null,
      };

      prismaMock.persona.findUnique.mockResolvedValue(null);
      prismaMock.persona.create.mockResolvedValue(socioCreado);

      const creado = await service.create(dto, 1);

      // Simulamos que el registro recien creado ya esta en la "base" para el listado
      prismaMock.$transaction.mockResolvedValue([[socioCreado], 1]);

      const listado = await service.findAll({
        pagina: 1,
        porPagina: 10,
      });

      expect(listado.items).toContainEqual(
        expect.objectContaining({ id: creado.id, dni: dto.dni, nombre: dto.nombre }),
      );
      expect(listado.total).toBe(1);
    });
  });

  describe('US-11: Editar datos personales del socio', () => {
    const usuarioMock = {
      id: 5,
      email: 'socio@club.com',
      nombre: 'Pedro',
      apellido: 'Gomez',
      activo: true,
      persona: {
        id: 12,
        dni: '38111222',
        nombre: 'Pedro',
        apellido: 'Gomez',
        email: 'socio@club.com',
        telefono: '351 111 2222',
        activo: true,
        categoriaId: 1,
        categoria: { id: 1, nombre: 'Activo' },
      },
    };

    it('actualiza los datos permitidos del socio, sincroniza usuario y persona, y genera registro de auditoría', async () => {
      const dto = {
        nombre: 'Pedro Pablo',
        apellido: 'Gomez Alvarez',
        email: 'pedro.nuevo@club.com',
        telefono: '351 999 8888',
      };

      const personaActualizada = {
        ...usuarioMock.persona,
        nombre: dto.nombre,
        apellido: dto.apellido,
        email: dto.email,
        telefono: dto.telefono,
      };

      prismaMock.usuario.findUnique.mockResolvedValue(usuarioMock);
      prismaMock.usuario.findFirst.mockResolvedValue(null);
      prismaMock.persona.findFirst.mockResolvedValue(null);
      prismaMock.usuario.update.mockResolvedValue({ ...usuarioMock, ...dto });
      prismaMock.persona.update.mockResolvedValue(personaActualizada);

      const resultado = await service.updatePerfil(5, dto);

      // Sincroniza Usuario
      expect(prismaMock.usuario.update).toHaveBeenCalledWith({
        where: { id: 5 },
        data: {
          nombre: dto.nombre,
          apellido: dto.apellido,
          email: dto.email,
        },
      });

      // Actualiza ficha Persona
      expect(prismaMock.persona.update).toHaveBeenCalledWith({
        where: { id: 12 },
        data: {
          nombre: dto.nombre,
          apellido: dto.apellido,
          email: dto.email,
          telefono: dto.telefono,
        },
        include: { categoria: true },
      });

      // Registra en auditoria inalterable
      expect(auditoriaMock.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          accion: 'EDITAR',
          entidad: 'Persona',
          idEntidad: 12,
          responsableId: 5,
        }),
        expect.anything(),
      );

      expect(resultado).toEqual(personaActualizada);
    });

    it('rechaza la edición si el nuevo correo ya está registrado por otro usuario activo', async () => {
      const dto = {
        nombre: 'Pedro',
        apellido: 'Gomez',
        email: 'otro@club.com',
      };

      prismaMock.usuario.findUnique.mockResolvedValue(usuarioMock);
      prismaMock.usuario.findFirst.mockResolvedValue({ id: 99 }); // Otro usuario con ese mail

      await expect(service.updatePerfil(5, dto)).rejects.toBeInstanceOf(ConflictException);
      await expect(service.updatePerfil(5, dto)).rejects.toThrow(
        'El correo electrónico ya se encuentra registrado por otro usuario',
      );

      expect(prismaMock.persona.update).not.toHaveBeenCalled();
      expect(auditoriaMock.registrar).not.toHaveBeenCalled();
    });

    it('rechaza la edición si el nuevo correo ya está registrado por otro socio activo', async () => {
      const dto = {
        nombre: 'Pedro',
        apellido: 'Gomez',
        email: 'otro.socio@club.com',
      };

      prismaMock.usuario.findUnique.mockResolvedValue(usuarioMock);
      prismaMock.usuario.findFirst.mockResolvedValue(null);
      prismaMock.persona.findFirst.mockResolvedValue({ id: 99 }); // Otra persona con ese mail

      await expect(service.updatePerfil(5, dto)).rejects.toBeInstanceOf(ConflictException);
      await expect(service.updatePerfil(5, dto)).rejects.toThrow(
        'El correo electrónico ya se encuentra registrado por otro socio',
      );

      expect(prismaMock.persona.update).not.toHaveBeenCalled();
    });

    it('rechaza la edición si el usuario no tiene ficha de socio asociada', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 5,
        email: 'usuario@club.com',
        activo: true,
        persona: null,
      });

      await expect(
        service.updatePerfil(5, { nombre: 'A', apellido: 'B', email: 'a@b.com' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rechaza la edición si el usuario está dado de baja', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 5,
        email: 'usuario@club.com',
        activo: false,
        persona: usuarioMock.persona,
      });

      await expect(
        service.updatePerfil(5, { nombre: 'A', apellido: 'B', email: 'a@b.com' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  /**
   * TC-024: Confirmar que el socio quede asociado al rol correspondiente ("Socio").
   *
   * Persona (lo que crea SociosService.create) NO tiene
   * ningun campo de rol. Los roles del sistema (ADMIN, COLABORADOR) estan
   * modelados sobre `Usuario` vía la tabla intermedia
   * `UsuarioRol` — y `Usuario` es una entidad distinta de `Persona` (login vs.
   * "alguien gestionado por el club").
   */
  it.todo(
    'TC-024: el socio creado queda asociado al rol "Socio" — requiere decisión de producto, ver comentario arriba (Persona no tiene rol; los roles solo existen en Usuario/UsuarioRol)',
  );
});
