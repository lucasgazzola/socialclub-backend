import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { DisciplinasService } from './disciplinas.service';
import { EstadoDisciplinaFiltro } from './dto/find-disciplinas-query.dto';

/**
 * US-XX (ABM Disciplinas) — tests unitarios del DisciplinasService.
 * Cubren las reglas de negocio: unicidad de nombre, 404, auditoría de
 * CREAR / EDITAR / BAJA / REACTIVAR y manejo de requisitos documentales.
 */
describe('DisciplinasService', () => {
  let service: DisciplinasService;

  const disciplinaRequerimientoDocMock = {
    createMany: jest.fn(),
    deleteMany: jest.fn(),
  };
  const txMock = {
    disciplina: {
      create: jest.fn(),
      update: jest.fn(),
    },
    disciplinaRequerimientoDoc: disciplinaRequerimientoDocMock,
  };
  const prismaMock = {
    disciplina: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn((value: ((tx: typeof txMock) => unknown) | unknown[]) =>
      Array.isArray(value) ? Promise.all(value) : (value as (tx: typeof txMock) => unknown)(txMock)),
  };
  const auditoriaMock = { registrar: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        DisciplinasService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuditoriaService, useValue: auditoriaMock },
      ],
    }).compile();
    service = moduleRef.get(DisciplinasService);
  });

  // ─── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('crea la disciplina y audita CREAR', async () => {
      prismaMock.disciplina.findUnique
        .mockResolvedValueOnce(null) // nombre no duplicado
        .mockResolvedValueOnce({
          id: 3,
          nombre: 'Vóley',
          activo: true,
          requerimientosDoc: [],
          categorias: [],
          _count: {},
          configuracionesCuotaDeportiva: [],
        }); // findOne interno
      txMock.disciplina.create.mockResolvedValue({ id: 3, nombre: 'Vóley' });

      const res = await service.create({ nombre: 'Vóley' }, 5);

      expect(res.id).toBe(3);
      expect(auditoriaMock.registrar).toHaveBeenCalledWith(
        expect.objectContaining({ accion: 'CREAR', entidad: 'Disciplina', idEntidad: 3 }),
      );
    });

    it('rechaza crear una disciplina con nombre duplicado', async () => {
      prismaMock.disciplina.findUnique.mockResolvedValue({ id: 1, nombre: 'Vóley' });

      await expect(service.create({ nombre: 'Vóley' }, 5)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('crea requerimientosDoc cuando solicitaDocumentacion=true', async () => {
      prismaMock.disciplina.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({
        id: 7,
        nombre: 'Natación',
        activo: true,
        requerimientosDoc: [{ id: 1, tipoDocumento: 'CERTIFICADO_MEDICO_APTITUD_FISICA', plazoDiasTolerancia: 30 }],
        categorias: [],
        _count: {},
        configuracionesCuotaDeportiva: [],
      });
      txMock.disciplina.create.mockResolvedValue({ id: 7, nombre: 'Natación' });

      await service.create(
        {
          nombre: 'Natación',
          solicitaDocumentacion: true,
          requerimientosDocumentacion: [{ tipoDocumento: 'CERTIFICADO_MEDICO_APTITUD_FISICA', plazoDiasTolerancia: 30 }],
        },
        5,
      );

      expect(txMock.disciplinaRequerimientoDoc.createMany).toHaveBeenCalledWith({
        data: [{ disciplinaId: 7, tipoDocumento: 'CERTIFICADO_MEDICO_APTITUD_FISICA', plazoDiasTolerancia: 30 }],
      });
    });

    it('no crea requerimientosDoc cuando solicitaDocumentacion=false', async () => {
      prismaMock.disciplina.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({
        id: 8,
        nombre: 'Yoga',
        activo: true,
        requerimientosDoc: [],
        categorias: [],
        _count: {},
        configuracionesCuotaDeportiva: [],
      });
      txMock.disciplina.create.mockResolvedValue({ id: 8, nombre: 'Yoga' });

      await service.create({ nombre: 'Yoga', solicitaDocumentacion: false }, 5);

      expect(txMock.disciplinaRequerimientoDoc.createMany).not.toHaveBeenCalled();
    });
  });

  // ─── findOne ─────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('aplica búsqueda, estado y paginación en backend', async () => {
      prismaMock.disciplina.findMany.mockResolvedValue([]);
      prismaMock.disciplina.count.mockResolvedValue(0);

      const resultado = await service.findAll({ busqueda: 'nat', estado: EstadoDisciplinaFiltro.ACTIVA, pagina: 2, porPagina: 10 });

      expect(prismaMock.disciplina.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: {
          activo: true,
          OR: [
            { nombre: { contains: 'nat', mode: 'insensitive' } },
            { descripcion: { contains: 'nat', mode: 'insensitive' } },
          ],
        },
        skip: 10,
        take: 10,
      }));
      expect(resultado).toEqual({
        items: [],
        total: 0,
        pagina: 2,
        porPagina: 10,
        conteos: { todas: 0, activas: 0, inactivas: 0 },
      });
    });
  });

  describe('findOne', () => {
    it('lanza 404 si la disciplina no existe', async () => {
      prismaMock.disciplina.findUnique.mockResolvedValue(null);

      await expect(service.findOne(99)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ─── update ──────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('rechaza un rango de edad inválido', async () => {
      prismaMock.disciplina.findUnique.mockResolvedValue({
        id: 1,
        nombre: 'Fútbol',
        activo: true,
        edadMinima: 18,
        edadMaxima: 30,
        requerimientosDoc: [],
        categorias: [],
        _count: {},
        configuracionesCuotaDeportiva: [],
      });

      await expect(service.update(1, { edadMaxima: 12 }, 5)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('rechaza renombrar a un nombre ya usado por otra disciplina', async () => {
      prismaMock.disciplina.findUnique
        .mockResolvedValueOnce({
          id: 1,
          nombre: 'Fútbol',
          activo: true,
          requerimientosDoc: [],
          categorias: [],
          _count: {},
          configuracionesCuotaDeportiva: [],
        })
        .mockResolvedValueOnce({ id: 2, nombre: 'Vóley' }); // nombre duplicado

      await expect(service.update(1, { nombre: 'Vóley' }, 5)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('actualiza y audita EDITAR', async () => {
      prismaMock.disciplina.findUnique
        .mockResolvedValueOnce({
          id: 1,
          nombre: 'Fútbol',
          activo: true,
          requerimientosDoc: [],
          categorias: [],
          _count: {},
          configuracionesCuotaDeportiva: [],
        })
        .mockResolvedValueOnce({
          id: 1,
          nombre: 'Fútbol',
          activo: true,
          requerimientosDoc: [],
          categorias: [],
          _count: {},
          configuracionesCuotaDeportiva: [],
        });
      txMock.disciplina.update.mockResolvedValue({ id: 1, descripcion: 'Mayores' });

      await service.update(1, { descripcion: 'Mayores' }, 5);

      expect(auditoriaMock.registrar).toHaveBeenCalledWith(
        expect.objectContaining({ accion: 'EDITAR', entidad: 'Disciplina', idEntidad: 1 }),
      );
    });

    it('reemplaza requerimientosDoc al actualizar con nuevos tipos', async () => {
      prismaMock.disciplina.findUnique
        .mockResolvedValueOnce({
          id: 1,
          nombre: 'Fútbol',
          activo: true,
          solicitaDocumentacion: true,
          requerimientosDoc: [],
          categorias: [],
          _count: {},
          configuracionesCuotaDeportiva: [],
        })
        .mockResolvedValueOnce({
          id: 1,
          nombre: 'Fútbol',
          activo: true,
          requerimientosDoc: [],
          categorias: [],
          _count: {},
          configuracionesCuotaDeportiva: [],
        });
      txMock.disciplina.update.mockResolvedValue({ id: 1 });

      await service.update(
        1,
        {
          solicitaDocumentacion: true,
          requerimientosDocumentacion: [
            { tipoDocumento: 'CERTIFICADO_MEDICO_APTITUD_FISICA', plazoDiasTolerancia: 30 },
            { tipoDocumento: 'DNI', plazoDiasTolerancia: 0 },
          ],
        },
        5,
      );

      expect(txMock.disciplinaRequerimientoDoc.deleteMany).toHaveBeenCalledWith({
        where: { disciplinaId: 1 },
      });
      expect(txMock.disciplinaRequerimientoDoc.createMany).toHaveBeenCalledWith({
        data: [
          { disciplinaId: 1, tipoDocumento: 'CERTIFICADO_MEDICO_APTITUD_FISICA', plazoDiasTolerancia: 30 },
          { disciplinaId: 1, tipoDocumento: 'DNI', plazoDiasTolerancia: 0 },
        ],
      });
    });
  });

  // ─── deactivate ───────────────────────────────────────────────────────────────

  describe('deactivate', () => {
    it('da de baja (activo=false) y audita BAJA', async () => {
      prismaMock.disciplina.findUnique.mockResolvedValue({
        id: 1,
        nombre: 'Fútbol',
        activo: true,
        requerimientosDoc: [],
        categorias: [],
        _count: {},
        configuracionesCuotaDeportiva: [],
      });
      prismaMock.disciplina.update.mockResolvedValue({ id: 1, activo: false });

      await service.deactivate(1, 5);

      expect(prismaMock.disciplina.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 1 }, data: { activo: false } }),
      );
      expect(auditoriaMock.registrar).toHaveBeenCalledWith(
        expect.objectContaining({ accion: 'BAJA', entidad: 'Disciplina', idEntidad: 1 }),
      );
    });

    it('lanza ConflictException si la disciplina ya estaba inactiva', async () => {
      prismaMock.disciplina.findUnique.mockResolvedValue({
        id: 1,
        nombre: 'Fútbol',
        activo: false,
        requerimientosDoc: [],
        categorias: [],
        _count: {},
        configuracionesCuotaDeportiva: [],
      });

      await expect(service.deactivate(1, 5)).rejects.toBeInstanceOf(ConflictException);
      expect(prismaMock.disciplina.update).not.toHaveBeenCalled();
    });
  });

  // ─── reactivate ──────────────────────────────────────────────────────────────

  describe('reactivate', () => {
    it('reactiva (activo=true) y audita REACTIVAR', async () => {
      prismaMock.disciplina.findUnique.mockResolvedValue({
        id: 1,
        nombre: 'Fútbol',
        activo: false,
        requerimientosDoc: [],
        categorias: [],
        _count: {},
        configuracionesCuotaDeportiva: [],
      });
      prismaMock.disciplina.update.mockResolvedValue({ id: 1, activo: true });

      await service.reactivate(1, 5);

      expect(prismaMock.disciplina.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 1 }, data: { activo: true } }),
      );
      expect(auditoriaMock.registrar).toHaveBeenCalledWith(
        expect.objectContaining({ accion: 'REACTIVAR', entidad: 'Disciplina', idEntidad: 1 }),
      );
    });

    it('lanza ConflictException si la disciplina ya estaba activa', async () => {
      prismaMock.disciplina.findUnique.mockResolvedValue({
        id: 1,
        nombre: 'Fútbol',
        activo: true,
        requerimientosDoc: [],
        categorias: [],
        _count: {},
        configuracionesCuotaDeportiva: [],
      });

      await expect(service.reactivate(1, 5)).rejects.toBeInstanceOf(ConflictException);
      expect(prismaMock.disciplina.update).not.toHaveBeenCalled();
    });

    it('lanza NotFoundException si la disciplina no existe', async () => {
      prismaMock.disciplina.findUnique.mockResolvedValue(null);

      await expect(service.reactivate(99, 5)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
