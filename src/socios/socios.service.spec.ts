import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { SociosService } from './socios.service';

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
    membresia: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
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
      findFirst: jest.fn(),
    },
    inscripcion: {
      create: jest.fn(),
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
    prismaMock.categoriaSocio.findUnique.mockResolvedValue({ id: 1, nombre: 'Activo' });
    prismaMock.categoriaSocio.findFirst.mockResolvedValue({ id: 1, nombre: 'Activo' });
    prismaMock.rol.findUnique.mockResolvedValue({ id: 3, nombre: 'SOCIO' });

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        SociosService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuditoriaService, useValue: auditoriaMock },
      ],
    }).compile();

    service = moduleRef.get(SociosService);
  });

  describe('TC-019: Registrar un nuevo socio con datos válidos (carga administrativa)', () => {
    it('crea el socio (Persona + Membresía), lo persiste y deja constancia en auditoría', async () => {
      const dto = {
        nombre: 'Lucas',
        apellido: 'Gazzola',
        dni: '40123456',
        email: 'lucas.gazzola@example.com',
        telefono: '351 123 4567',
        fechaNacimiento: '1998-05-20',
        categoriaId: 1,
      };

      const personaCreada = {
        id: 10,
        nombre: dto.nombre,
        apellido: dto.apellido,
        dni: dto.dni,
        email: dto.email,
        telefono: dto.telefono,
        fechaNacimiento: new Date(dto.fechaNacimiento),
        creadoEn: new Date(),
        actualizadoEn: new Date(),
        membresias: [
          {
            id: 100,
            categoriaId: 1,
            categoria: { id: 1, nombre: 'Activo' },
            activo: true,
            fechaAlta: new Date(),
            fechaBaja: null,
          },
        ],
        usuario: null,
      };

      prismaMock.persona.findUnique.mockResolvedValue(null);
      prismaMock.persona.findFirst.mockResolvedValue(null);
      prismaMock.persona.create.mockResolvedValue(personaCreada);

      const resultado = await service.create(dto, 99);

      expect(prismaMock.persona.create).toHaveBeenCalled();
      expect(resultado).toEqual(
        expect.objectContaining({
          id: 10,
          dni: dto.dni,
          nombre: dto.nombre,
          activo: true,
          categoriaId: 1,
        }),
      );

      expect(auditoriaMock.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          accion: 'CREAR',
          responsableId: 99,
        }),
        expect.anything(),
      );
    });

    it('permite registrar un socio sin fechaNacimiento (campo opcional)', async () => {
      const dto = { nombre: 'Ana', apellido: 'Diaz', dni: '30999888' };
      const personaCreada = {
        id: 11,
        ...dto,
        email: null,
        telefono: null,
        fechaNacimiento: null,
        creadoEn: new Date(),
        actualizadoEn: new Date(),
        membresias: [
          {
            id: 101,
            categoriaId: 1,
            categoria: { id: 1, nombre: 'Activo' },
            activo: true,
            fechaAlta: new Date(),
            fechaBaja: null,
          },
        ],
        usuario: null,
      };

      prismaMock.persona.findUnique.mockResolvedValue(null);
      prismaMock.persona.create.mockResolvedValue(personaCreada);

      const resultado = await service.create(dto, 1);
      expect(resultado.id).toBe(11);
    });
  });

  describe('TC-020: Validaciones de duplicados en alta de socio', () => {
    it('rechaza el alta administrativa si la persona con ese DNI ya tiene una membresía activa', async () => {
      prismaMock.persona.findUnique.mockResolvedValue({
        id: 1,
        dni: '30111222',
        membresias: [{ id: 1, activo: true }],
      });

      await expect(
        service.create({ nombre: 'Otro', apellido: 'Socio', dni: '30111222', categoriaId: 1 }, 99),
      ).rejects.toThrow('Ya existe un socio activo con ese DNI');
    });

    it('rechaza el alta si el email ya existe en otra persona', async () => {
      prismaMock.persona.findUnique.mockResolvedValue(null);
      prismaMock.persona.findFirst.mockResolvedValue({ id: 2, email: 'usado@club.com' });

      await expect(
        service.create(
          { nombre: 'Nuevo', apellido: 'Socio', dni: '30111333', email: 'usado@club.com' },
          99,
        ),
      ).rejects.toThrow('Ya existe una persona registrada con ese email');
    });
  });

  describe('US-09: Registrarme como socio (Autogestión)', () => {
    it('DNI existente: reutiliza Persona y crea Membresía sin pedir nuevo DNI', async () => {
      const usuarioMock = {
        id: 5,
        email: 'usuario@club.com',
        activo: true,
        persona: {
          id: 20,
          dni: '35123456',
          nombre: 'Juan',
          apellido: 'Perez',
          email: 'usuario@club.com',
          membresias: [], // sin membresía activa
        },
      };

      prismaMock.usuario.findUnique.mockResolvedValue(usuarioMock);
      prismaMock.membresia.create.mockResolvedValue({
        id: 201,
        personaId: 20,
        categoriaId: 1,
        activo: true,
        fechaAlta: new Date(),
      });
      prismaMock.usuarioRol.findUnique.mockResolvedValue(null);
      prismaMock.persona.findUnique.mockResolvedValue({
        ...usuarioMock.persona,
        membresias: [
          {
            id: 201,
            categoriaId: 1,
            categoria: { id: 1, nombre: 'Activo' },
            activo: true,
            fechaAlta: new Date(),
            fechaBaja: null,
          },
        ],
        usuario: { id: 5 },
      });

      const resultado = await service.registrarme({ categoriaId: 1 }, 5);

      // Reutiliza Persona existente, no sobreescribe su DNI
      expect(prismaMock.persona.update).not.toHaveBeenCalled();
      expect(prismaMock.membresia.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ personaId: 20, categoriaId: 1, activo: true }),
        }),
      );
      expect(resultado.dni).toBe('35123456');
      expect(resultado.activo).toBe(true);
    });

    it('DNI nuevo: si persona.dni es null, se pide, se valida unicidad y se guarda en Persona', async () => {
      const usuarioMock = {
        id: 6,
        email: 'nuevo@club.com',
        activo: true,
        persona: {
          id: 21,
          dni: null, // DNI pendiente
          nombre: 'Maria',
          apellido: 'Gomez',
          email: 'nuevo@club.com',
          membresias: [],
        },
      };

      prismaMock.usuario.findUnique.mockResolvedValue(usuarioMock);
      prismaMock.persona.findUnique
        .mockResolvedValueOnce(null) // findUnique persona con ese dni (disponible)
        .mockResolvedValueOnce({
          ...usuarioMock.persona,
          dni: '40999888',
          membresias: [
            {
              id: 202,
              categoriaId: 1,
              categoria: { id: 1, nombre: 'Activo' },
              activo: true,
              fechaAlta: new Date(),
              fechaBaja: null,
            },
          ],
          usuario: { id: 6 },
        });

      const resultado = await service.registrarme({ dni: '40999888', categoriaId: 1 }, 6);

      // Guarda el DNI en Persona
      expect(prismaMock.persona.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 21 },
          data: { dni: '40999888' },
        }),
      );
      expect(prismaMock.membresia.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ personaId: 21, categoriaId: 1, activo: true }),
        }),
      );
      expect(resultado.dni).toBe('40999888');
    });

    it('DNI nuevo: rechaza el alta si el DNI enviado ya pertenece a otra persona', async () => {
      const usuarioMock = {
        id: 7,
        email: 'otro@club.com',
        activo: true,
        persona: {
          id: 22,
          dni: null,
          nombre: 'Carlos',
          apellido: 'Perez',
          email: 'otro@club.com',
          membresias: [],
        },
      };

      prismaMock.usuario.findUnique.mockResolvedValue(usuarioMock);
      prismaMock.persona.findUnique.mockResolvedValue({ id: 99, dni: '40111222' }); // Pertenece a otra persona

      await expect(
        service.registrarme({ dni: '40111222', categoriaId: 1 }, 7),
      ).rejects.toThrow('Ya existe otra persona registrada con ese DNI');
    });

    it('Membresía activa existente: rechaza nueva alta autogestionada si ya es socio activo', async () => {
      const usuarioMock = {
        id: 8,
        email: 'activo@club.com',
        activo: true,
        persona: {
          id: 23,
          dni: '38111222',
          membresias: [{ id: 301, activo: true }],
        },
      };

      prismaMock.usuario.findUnique.mockResolvedValue(usuarioMock);

      await expect(service.registrarme({ categoriaId: 1 }, 8)).rejects.toThrow(
        'Ya sos socio: tu ficha de socio ya tiene una membresía activa',
      );
    });
  });

  describe('Historial de membresías', () => {
    it('soporta historial: una persona puede tener una membresía inactiva y una activa', async () => {
      const personaConHistorial = {
        id: 30,
        nombre: 'Valeria',
        apellido: 'Historica',
        dni: '25111222',
        email: 'valeria@club.com',
        telefono: null,
        fechaNacimiento: null,
        creadoEn: new Date('2023-01-01'),
        actualizadoEn: new Date('2025-01-01'),
        membresias: [
          {
            id: 2,
            categoriaId: 1,
            categoria: { id: 1, nombre: 'Mayores' },
            activo: true,
            fechaAlta: new Date('2025-01-01'),
            fechaBaja: null,
          },
          {
            id: 1,
            categoriaId: 2,
            categoria: { id: 2, nombre: 'Infantil' },
            activo: false,
            fechaAlta: new Date('2023-01-01'),
            fechaBaja: new Date('2024-01-01'),
          },
        ],
        usuario: null,
      };

      prismaMock.persona.findUnique.mockResolvedValue(personaConHistorial);

      const socio = await service.findOne(30);

      expect(socio.id).toBe(30);
      expect(socio.activo).toBe(true);
      expect(socio.categoriaId).toBe(1);
      expect(socio.membresias).toHaveLength(2);
      expect(socio.membresias[0].activo).toBe(true);
      expect(socio.membresias[1].activo).toBe(false);
      expect(socio.membresias[1].fechaBaja).not.toBeNull();
    });

    it('dar de baja socio desactiva únicamente la membresía activa asignando fechaBaja', async () => {
      const personaMock = {
        id: 35,
        membresias: [{ id: 50, activo: true }],
      };

      prismaMock.persona.findUnique.mockResolvedValue(personaMock);
      prismaMock.membresia.findFirst.mockResolvedValue({ id: 50, personaId: 35, activo: true });
      prismaMock.membresia.update.mockResolvedValue({ id: 50, activo: false, fechaBaja: new Date() });

      await service.deactivate(35, 99);

      expect(prismaMock.membresia.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 50 },
          data: expect.objectContaining({ activo: false, fechaBaja: expect.any(Date) }),
        }),
      );
      expect(auditoriaMock.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          accion: 'BAJA',
          entidad: 'Membresia',
          idEntidad: 50,
          responsableId: 99,
        }),
        expect.anything(),
      );
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
        membresias: [
          {
            id: 10,
            categoriaId: 1,
            categoria: { id: 1, nombre: 'Activo' },
            activo: true,
            fechaAlta: new Date(),
          },
        ],
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

      expect(prismaMock.usuario.update).toHaveBeenCalledWith({
        where: { id: 5 },
        data: {
          nombre: dto.nombre,
          apellido: dto.apellido,
          email: dto.email,
        },
      });

      expect(prismaMock.persona.update).toHaveBeenCalledWith({
        where: { id: 12 },
        data: {
          nombre: dto.nombre,
          apellido: dto.apellido,
          email: dto.email,
          telefono: dto.telefono,
        },
        include: {
          membresias: { include: { categoria: true }, orderBy: { fechaAlta: 'desc' } },
        },
      });

      expect(auditoriaMock.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          accion: 'EDITAR',
          entidad: 'Persona',
          idEntidad: 12,
          responsableId: 5,
        }),
        expect.anything(),
      );

      expect(resultado).toEqual(
        expect.objectContaining({
          id: 12,
          nombre: dto.nombre,
          apellido: dto.apellido,
          email: dto.email,
          telefono: dto.telefono,
        }),
      );
    });

    it('rechaza la edición si el nuevo correo ya está registrado por otro usuario', async () => {
      const dto = {
        nombre: 'Pedro',
        apellido: 'Gomez',
        email: 'otro@club.com',
      };

      prismaMock.usuario.findUnique.mockResolvedValue(usuarioMock);
      prismaMock.usuario.findFirst.mockResolvedValue({ id: 99 });

      await expect(service.updatePerfil(5, dto)).rejects.toThrow(
        'El correo electrónico ya se encuentra registrado por otro usuario',
      );
    });

    it('rechaza la edición si el nuevo correo ya está registrado por otra persona', async () => {
      const dto = {
        nombre: 'Pedro',
        apellido: 'Gomez',
        email: 'otro.socio@club.com',
      };

      prismaMock.usuario.findUnique.mockResolvedValue(usuarioMock);
      prismaMock.usuario.findFirst.mockResolvedValue(null);
      prismaMock.persona.findFirst.mockResolvedValue({ id: 99 });

      await expect(service.updatePerfil(5, dto)).rejects.toThrow(
        'El correo electrónico ya se encuentra registrado por otra persona',
      );
    });

    it('rechaza la edición si el usuario no tiene ficha de socio activa asociada', async () => {
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
  });

  describe('Independencia de Persona e Inscripcion', () => {
    it('una Persona sin Usuario ni Membresia puede crearse y registrar una Inscripcion', async () => {
      const personaGimnasio = {
        id: 50,
        nombre: 'Esteban',
        apellido: 'Gimnasio',
        dni: '50000005',
        email: 'esteban@externo.local',
        usuario: null,
        membresias: [],
        inscripciones: [
          {
            id: 1,
            personaId: 50,
            disciplinaId: 6,
            activo: true,
          },
        ],
      };

      prismaMock.persona.create.mockResolvedValue(personaGimnasio);

      // Verificamos el modelo: la entidad Persona no requiere Usuario ni Membresia para participar en disciplinas
      expect(personaGimnasio.usuario).toBeNull();
      expect(personaGimnasio.membresias).toHaveLength(0);
      expect(personaGimnasio.inscripciones).toHaveLength(1);
      expect(personaGimnasio.inscripciones[0].disciplinaId).toBe(6);
    });
  });
});
