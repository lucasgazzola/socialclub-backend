import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { DisciplinasService } from './disciplinas.service';

/**
 * US-20 (dominio Disciplinas) — tests unitarios del DisciplinasService.
 * Cubren las reglas reales: unicidad de nombre, 404, y auditoría de
 * CREAR / EDITAR / BAJA.
 */
describe('DisciplinasService', () => {
  let service: DisciplinasService;

  const prismaMock = {
    disciplina: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
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

  describe('create', () => {
    it('crea la disciplina y audita CREAR', async () => {
      prismaMock.disciplina.findUnique.mockResolvedValue(null);
      prismaMock.disciplina.create.mockResolvedValue({ id: 3, nombre: 'Vóley' });

      const res = await service.create({ nombre: 'Vóley' }, 5);

      expect(res.id).toBe(3);
      expect(auditoriaMock.registrar).toHaveBeenCalledWith(
        expect.objectContaining({ accion: 'CREAR', entidad: 'Disciplina', idEntidad: 3 }),
      );
    });

    it('rechaza crear una disciplina con nombre duplicado', async () => {
      prismaMock.disciplina.findUnique.mockResolvedValue({ id: 1, nombre: 'Vóley' });

      await expect(service.create({ nombre: 'Vóley' }, 5)).rejects.toBeInstanceOf(ConflictException);
      expect(prismaMock.disciplina.create).not.toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('lanza 404 si la disciplina no existe', async () => {
      prismaMock.disciplina.findUnique.mockResolvedValue(null);

      await expect(service.findOne(99)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('update', () => {
    it('rechaza renombrar a un nombre ya usado por otra disciplina', async () => {
      // findOne(id) encuentra la disciplina a editar...
      prismaMock.disciplina.findUnique.mockResolvedValueOnce({ id: 1, nombre: 'Fútbol' });
      // ...y la verificación de nombre encuentra OTRA con ese nombre.
      prismaMock.disciplina.findUnique.mockResolvedValueOnce({ id: 2, nombre: 'Vóley' });

      await expect(service.update(1, { nombre: 'Vóley' }, 5)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prismaMock.disciplina.update).not.toHaveBeenCalled();
    });

    it('actualiza y audita EDITAR', async () => {
      prismaMock.disciplina.findUnique.mockResolvedValue({ id: 1, nombre: 'Fútbol' });
      prismaMock.disciplina.update.mockResolvedValue({ id: 1, descripcion: 'Mayores' });

      await service.update(1, { descripcion: 'Mayores' }, 5);

      expect(auditoriaMock.registrar).toHaveBeenCalledWith(
        expect.objectContaining({ accion: 'EDITAR', entidad: 'Disciplina', idEntidad: 1 }),
      );
    });
  });

  describe('deactivate', () => {
    it('da de baja (activo=false) y audita BAJA', async () => {
      prismaMock.disciplina.findUnique.mockResolvedValue({ id: 1, nombre: 'Fútbol' });
      prismaMock.disciplina.update.mockResolvedValue({ id: 1, activo: false });

      await service.deactivate(1, 5);

      expect(prismaMock.disciplina.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 1 }, data: { activo: false } }),
      );
      expect(auditoriaMock.registrar).toHaveBeenCalledWith(
        expect.objectContaining({ accion: 'BAJA', entidad: 'Disciplina', idEntidad: 1 }),
      );
    });
  });
});
