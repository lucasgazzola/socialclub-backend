import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { CategoriasDisciplinaService } from './categorias-disciplina.service';
import { EstadoCategoriaFiltro } from './dto/find-categorias-disciplina-query.dto';

/**
 * US-48 a US-51 — ABM de categorías de disciplina con documentación
 * obligatoria adicional. Tests unitarios del CategoriasDisciplinaService.
 */
describe('CategoriasDisciplinaService', () => {
  let service: CategoriasDisciplinaService;

  const txMock = {
    categoriaDisciplina: { create: jest.fn(), update: jest.fn() },
    disciplinaRequerimientoDoc: {
      findMany: jest.fn(),
      createMany: jest.fn(),
      deleteMany: jest.fn(),
      update: jest.fn(),
    },
  };
  const prismaMock = {
    disciplina: { findUnique: jest.fn() },
    categoriaDisciplina: { findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    $transaction: jest.fn((fn: (tx: typeof txMock) => unknown) => fn(txMock)),
  };
  const auditoriaMock = { registrar: jest.fn() };

  const futbol = {
    id: 1,
    nombre: 'Fútbol',
    activo: true,
    solicitaDocumentacion: true,
    genero: null,
    edadMinima: 6,
    edadMaxima: 18,
    requerimientosDoc: [
      { id: 1, tipoDocumento: 'CERTIFICADO_MEDICO_APTITUD_FISICA', plazoDiasTolerancia: 30 },
    ],
  };
  const sub15 = {
    id: 7,
    disciplinaId: 1,
    nombre: 'Sub-15',
    genero: null,
    edadMinima: 13,
    edadMaxima: 15,
    activo: true,
    requerimientosDoc: [],
    _count: { inscripciones: 0 },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    txMock.disciplinaRequerimientoDoc.findMany.mockResolvedValue([]);
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        CategoriasDisciplinaService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuditoriaService, useValue: auditoriaMock },
      ],
    }).compile();
    service = moduleRef.get(CategoriasDisciplinaService);
  });

  // ─── US-48 · Agregar categoría ─────────────────────────────────────────────

  describe('US-48 · create', () => {
    it('crea la categoría activa con su documentación adicional y audita CREAR', async () => {
      prismaMock.disciplina.findUnique.mockResolvedValue(futbol);
      prismaMock.categoriaDisciplina.findFirst
        .mockResolvedValueOnce(null) // nombre libre
        .mockResolvedValueOnce(sub15); // findOne final
      txMock.categoriaDisciplina.create.mockResolvedValue({ id: 7, nombre: 'Sub-15' });

      const res = await service.create(
        1,
        {
          nombre: 'Sub-15',
          genero: 'FEMENINO',
          edadMinima: 13,
          edadMaxima: 15,
          requerimientosDocumentacion: [
            { tipoDocumento: 'AUTORIZACION_PADRES_TUTORES', plazoDiasTolerancia: 15 },
          ],
        },
        5,
      );

      expect(res.id).toBe(7);
      expect(txMock.categoriaDisciplina.create).toHaveBeenCalledWith({
        data: {
          disciplinaId: 1,
          nombre: 'Sub-15',
          genero: 'FEMENINO',
          edadMinima: 13,
          edadMaxima: 15,
        },
      });
      expect(txMock.disciplinaRequerimientoDoc.createMany).toHaveBeenCalledWith({
        data: [
          {
            disciplinaId: 1,
            categoriaDisciplinaId: 7,
            tipoDocumento: 'AUTORIZACION_PADRES_TUTORES',
            plazoDiasTolerancia: 15,
          },
        ],
      });
      expect(auditoriaMock.registrar).toHaveBeenCalledWith(
        expect.objectContaining({ accion: 'CREAR', entidad: 'CategoriaDisciplina', idEntidad: 7 }),
      );
    });

    it('crea una categoría sin documentación adicional', async () => {
      prismaMock.disciplina.findUnique.mockResolvedValue(futbol);
      prismaMock.categoriaDisciplina.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(sub15);
      txMock.categoriaDisciplina.create.mockResolvedValue({ id: 7, nombre: 'Primera' });

      await service.create(1, { nombre: 'Primera' }, 5);

      expect(txMock.disciplinaRequerimientoDoc.createMany).not.toHaveBeenCalled();
    });

    it('rechaza un nombre que ya existe en la misma disciplina (sin distinguir mayúsculas)', async () => {
      prismaMock.disciplina.findUnique.mockResolvedValue(futbol);
      prismaMock.categoriaDisciplina.findFirst.mockResolvedValue({ id: 3, nombre: 'SUB-15' });

      await expect(service.create(1, { nombre: 'sub-15' }, 5)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prismaMock.categoriaDisciplina.findFirst).toHaveBeenCalledWith({
        where: { disciplinaId: 1, nombre: { equals: 'sub-15', mode: 'insensitive' } },
      });
      expect(txMock.categoriaDisciplina.create).not.toHaveBeenCalled();
    });

    it('rechaza documentación que ya exige la disciplina', async () => {
      prismaMock.disciplina.findUnique.mockResolvedValue(futbol);
      prismaMock.categoriaDisciplina.findFirst.mockResolvedValue(null);

      await expect(
        service.create(
          1,
          {
            nombre: 'Sub-15',
            requerimientosDocumentacion: [
              { tipoDocumento: 'CERTIFICADO_MEDICO_APTITUD_FISICA', plazoDiasTolerancia: 0 },
            ],
          },
          5,
        ),
      ).rejects.toThrow('La disciplina ya exige: Certificado médico de aptitud física.');
      expect(txMock.categoriaDisciplina.create).not.toHaveBeenCalled();
    });

    it('rechaza un tipo de documento repetido en la categoría', async () => {
      prismaMock.disciplina.findUnique.mockResolvedValue(futbol);
      prismaMock.categoriaDisciplina.findFirst.mockResolvedValue(null);
      txMock.categoriaDisciplina.create.mockResolvedValue({ id: 7, nombre: 'Sub-15' });

      await expect(
        service.create(
          1,
          {
            nombre: 'Sub-15',
            requerimientosDocumentacion: [
              { tipoDocumento: 'DNI', plazoDiasTolerancia: 0 },
              { tipoDocumento: 'DNI', plazoDiasTolerancia: 5 },
            ],
          },
          5,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(auditoriaMock.registrar).not.toHaveBeenCalled();
    });

    it('rechaza un rango de edad fuera del de la disciplina', async () => {
      prismaMock.disciplina.findUnique.mockResolvedValue(futbol);
      prismaMock.categoriaDisciplina.findFirst.mockResolvedValue(null);

      await expect(
        service.create(1, { nombre: 'Veteranos', edadMinima: 35, edadMaxima: null }, 5),
      ).rejects.toThrow('El rango de edad de la categoría debe quedar dentro del de la disciplina');
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('rechaza un género distinto al de una disciplina restringida', async () => {
      prismaMock.disciplina.findUnique.mockResolvedValue({ ...futbol, genero: 'FEMENINO' });
      prismaMock.categoriaDisciplina.findFirst.mockResolvedValue(null);

      await expect(
        service.create(1, { nombre: 'Primera', genero: 'MASCULINO' }, 5),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza agregar categorías a una disciplina inactiva', async () => {
      prismaMock.disciplina.findUnique.mockResolvedValue({ ...futbol, activo: false });

      await expect(service.create(1, { nombre: 'Sub-15' }, 5)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('lanza 404 si la disciplina no existe', async () => {
      prismaMock.disciplina.findUnique.mockResolvedValue(null);

      await expect(service.create(99, { nombre: 'Sub-15' }, 5)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // ─── US-49 · Editar categoría ──────────────────────────────────────────────

  describe('US-49 · update', () => {
    it('edita el nombre y audita EDITAR con el cambio', async () => {
      prismaMock.disciplina.findUnique.mockResolvedValue(futbol);
      prismaMock.categoriaDisciplina.findFirst
        .mockResolvedValueOnce(sub15) // findOne actual
        .mockResolvedValueOnce(null) // nombre libre
        .mockResolvedValueOnce({ ...sub15, nombre: 'Sub-16' });

      await service.update(1, 7, { nombre: 'Sub-16' }, 5);

      expect(prismaMock.categoriaDisciplina.findFirst).toHaveBeenNthCalledWith(2, {
        where: {
          disciplinaId: 1,
          nombre: { equals: 'Sub-16', mode: 'insensitive' },
          id: { not: 7 },
        },
      });
      expect(txMock.categoriaDisciplina.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: { nombre: 'Sub-16' },
      });
      expect(auditoriaMock.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          accion: 'EDITAR',
          entidad: 'CategoriaDisciplina',
          detalle: expect.stringContaining('"Sub-15" → "Sub-16"') as string,
        }),
      );
    });

    it('edita las restricciones y conserva las que no se envían', async () => {
      prismaMock.disciplina.findUnique.mockResolvedValue(futbol);
      prismaMock.categoriaDisciplina.findFirst.mockResolvedValue(sub15);

      await service.update(1, 7, { edadMinima: 14 }, 5);

      expect(txMock.categoriaDisciplina.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: { genero: null, edadMinima: 14, edadMaxima: 15 },
      });
      expect(auditoriaMock.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          detalle: expect.stringContaining(
            'restricciones: cualquier género, 14 a 15 años',
          ) as string,
        }),
      );
    });

    it('rechaza editar dejando la máxima menor que la mínima guardada', async () => {
      prismaMock.disciplina.findUnique.mockResolvedValue(futbol);
      prismaMock.categoriaDisciplina.findFirst.mockResolvedValue(sub15);

      await expect(service.update(1, 7, { edadMaxima: 12 }, 5)).rejects.toThrow(
        'La edad máxima no puede ser menor que la edad mínima.',
      );
      expect(txMock.categoriaDisciplina.update).not.toHaveBeenCalled();
    });

    it('permite quitar una restricción propia (null = hereda de la disciplina)', async () => {
      prismaMock.disciplina.findUnique.mockResolvedValue(futbol);
      prismaMock.categoriaDisciplina.findFirst.mockResolvedValue(sub15);

      await service.update(1, 7, { edadMinima: null, edadMaxima: null }, 5);

      expect(txMock.categoriaDisciplina.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: { genero: null, edadMinima: null, edadMaxima: null },
      });
    });

    it('rechaza renombrar a un nombre de otra categoría de la disciplina', async () => {
      prismaMock.disciplina.findUnique.mockResolvedValue(futbol);
      prismaMock.categoriaDisciplina.findFirst
        .mockResolvedValueOnce(sub15)
        .mockResolvedValueOnce({ id: 8, nombre: 'Primera' });

      await expect(service.update(1, 7, { nombre: 'Primera' }, 5)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(txMock.categoriaDisciplina.update).not.toHaveBeenCalled();
    });

    it('agrega un requisito nuevo sin tocar los existentes (conserva su vigencia)', async () => {
      prismaMock.disciplina.findUnique.mockResolvedValue(futbol);
      prismaMock.categoriaDisciplina.findFirst.mockResolvedValue(sub15);
      txMock.disciplinaRequerimientoDoc.findMany.mockResolvedValue([
        { id: 20, tipoDocumento: 'AUTORIZACION_PADRES_TUTORES', plazoDiasTolerancia: 15 },
      ]);

      await service.update(
        1,
        7,
        {
          requerimientosDocumentacion: [
            { tipoDocumento: 'AUTORIZACION_PADRES_TUTORES', plazoDiasTolerancia: 15 },
            { tipoDocumento: 'SEGURO_COBERTURA_MEDICA', plazoDiasTolerancia: 10 },
          ],
        },
        5,
      );

      expect(txMock.disciplinaRequerimientoDoc.findMany).toHaveBeenCalledWith({
        where: { disciplinaId: 1, categoriaDisciplinaId: 7 },
      });
      expect(txMock.disciplinaRequerimientoDoc.deleteMany).not.toHaveBeenCalled();
      expect(txMock.disciplinaRequerimientoDoc.update).not.toHaveBeenCalled();
      expect(txMock.disciplinaRequerimientoDoc.createMany).toHaveBeenCalledWith({
        data: [
          {
            disciplinaId: 1,
            categoriaDisciplinaId: 7,
            tipoDocumento: 'SEGURO_COBERTURA_MEDICA',
            plazoDiasTolerancia: 10,
          },
        ],
      });
      expect(txMock.categoriaDisciplina.update).not.toHaveBeenCalled();
    });

    it('quita todos los requisitos adicionales con una lista vacía', async () => {
      prismaMock.disciplina.findUnique.mockResolvedValue(futbol);
      prismaMock.categoriaDisciplina.findFirst.mockResolvedValue(sub15);
      txMock.disciplinaRequerimientoDoc.findMany.mockResolvedValue([
        { id: 20, tipoDocumento: 'AUTORIZACION_PADRES_TUTORES', plazoDiasTolerancia: 15 },
      ]);

      await service.update(1, 7, { requerimientosDocumentacion: [] }, 5);

      expect(txMock.disciplinaRequerimientoDoc.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: [20] } },
      });
    });

    it('rechaza agregar un documento que ya exige la disciplina', async () => {
      prismaMock.disciplina.findUnique.mockResolvedValue(futbol);
      prismaMock.categoriaDisciplina.findFirst.mockResolvedValue(sub15);

      await expect(
        service.update(
          1,
          7,
          {
            requerimientosDocumentacion: [
              { tipoDocumento: 'CERTIFICADO_MEDICO_APTITUD_FISICA', plazoDiasTolerancia: 0 },
            ],
          },
          5,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('lanza 404 si la categoría no pertenece a la disciplina', async () => {
      prismaMock.disciplina.findUnique.mockResolvedValue(futbol);
      prismaMock.categoriaDisciplina.findFirst.mockResolvedValue(null);

      await expect(service.update(1, 99, { nombre: 'X' }, 5)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // ─── US-50 · Eliminar categoría (baja lógica) ──────────────────────────────

  describe('US-50 · deactivate / reactivate', () => {
    it('da de baja lógica (activo=false) sin borrar y audita BAJA', async () => {
      prismaMock.categoriaDisciplina.findFirst.mockResolvedValue(sub15);

      await service.deactivate(1, 7, 5);

      expect(prismaMock.categoriaDisciplina.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: { activo: false },
      });
      expect(auditoriaMock.registrar).toHaveBeenCalledWith(
        expect.objectContaining({ accion: 'BAJA', entidad: 'CategoriaDisciplina', idEntidad: 7 }),
      );
    });

    it('rechaza dar de baja una categoría ya inactiva', async () => {
      prismaMock.categoriaDisciplina.findFirst.mockResolvedValue({ ...sub15, activo: false });

      await expect(service.deactivate(1, 7, 5)).rejects.toBeInstanceOf(ConflictException);
      expect(prismaMock.categoriaDisciplina.update).not.toHaveBeenCalled();
    });

    it('reactiva una categoría inactiva y audita REACTIVAR', async () => {
      prismaMock.categoriaDisciplina.findFirst.mockResolvedValue({ ...sub15, activo: false });

      await service.reactivate(1, 7, 5);

      expect(prismaMock.categoriaDisciplina.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: { activo: true },
      });
      expect(auditoriaMock.registrar).toHaveBeenCalledWith(
        expect.objectContaining({ accion: 'REACTIVAR', idEntidad: 7 }),
      );
    });

    it('rechaza reactivar una categoría activa', async () => {
      prismaMock.categoriaDisciplina.findFirst.mockResolvedValue(sub15);

      await expect(service.reactivate(1, 7, 5)).rejects.toBeInstanceOf(ConflictException);
    });
  });

  // ─── US-51 · Consultar categorías ──────────────────────────────────────────

  describe('US-51 · findAll', () => {
    it('lista las categorías de la disciplina con los requisitos de la disciplina', async () => {
      prismaMock.disciplina.findUnique.mockResolvedValue(futbol);
      prismaMock.categoriaDisciplina.findMany.mockResolvedValue([sub15]);

      const res = await service.findAll(1, {
        busqueda: '  sub ',
        estado: EstadoCategoriaFiltro.ACTIVA,
      });

      expect(res.disciplina.requerimientosDoc).toHaveLength(1);
      expect(res.items).toEqual([sub15]);
      expect(prismaMock.categoriaDisciplina.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            disciplinaId: 1,
            activo: true,
            nombre: { contains: 'sub', mode: 'insensitive' },
          },
          orderBy: { nombre: 'asc' },
        }),
      );
    });

    it('filtra por categorías inactivas', async () => {
      prismaMock.disciplina.findUnique.mockResolvedValue(futbol);
      prismaMock.categoriaDisciplina.findMany.mockResolvedValue([]);

      const res = await service.findAll(1, { estado: EstadoCategoriaFiltro.INACTIVA });

      expect(res.items).toEqual([]);
      expect(prismaMock.categoriaDisciplina.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { disciplinaId: 1, activo: false } }),
      );
    });

    it('lanza 404 si la disciplina no existe', async () => {
      prismaMock.disciplina.findUnique.mockResolvedValue(null);

      await expect(service.findAll(99)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
