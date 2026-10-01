import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { DocumentacionService } from './documentacion.service';

/**
 * US-24 · Cargar documentación obligatoria de un participante.
 * Cubre las reglas de negocio: integrante existente, fecha no anterior a hoy,
 * y auditoría del alta. (La obligatoriedad de la fecha se valida en el DTO.)
 */
describe('US-24 · DocumentacionService', () => {
  let service: DocumentacionService;

  const prismaMock = {
    persona: { findUnique: jest.fn() },
    documentacion: { create: jest.fn(), findMany: jest.fn() },
  };
  const auditoriaMock = { registrar: jest.fn() };

  // La fecha se arma en hora LOCAL, no con toISOString(): el service compara
  // contra el día local, así que entre las 21:00 y las 00:00 en UTC-3 el "ayer"
  // en UTC es el "hoy" local y el caso de fecha vencida dejaba de fallar.
  const diasDesdeHoy = (dias: number) => {
    const d = new Date();
    d.setDate(d.getDate() + dias);
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const dia = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mes}-${dia}`; // YYYY-MM-DD
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentacionService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuditoriaService, useValue: auditoriaMock },
      ],
    }).compile();
    service = moduleRef.get(DocumentacionService);
  });

  it('carga el documento con fecha futura y audita CREAR', async () => {
    prismaMock.persona.findUnique.mockResolvedValue({ id: 1, nombre: 'Juan' });
    prismaMock.documentacion.create.mockResolvedValue({
      id: 10,
      tipo: 'Apto físico',
      personaId: 1,
    });

    const res = await service.create(
      { tipo: 'Apto físico', fechaVencimiento: diasDesdeHoy(30), personaId: 1 },
      7,
    );

    expect(res.id).toBe(10);
    expect(prismaMock.documentacion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tipo: 'Apto físico', personaId: 1 }),
      }),
    );
    expect(auditoriaMock.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ accion: 'CREAR', entidad: 'Documentacion', idEntidad: 10 }),
    );
  });

  it('acepta un documento que vence hoy (no es anterior a la fecha actual)', async () => {
    prismaMock.persona.findUnique.mockResolvedValue({ id: 1 });
    prismaMock.documentacion.create.mockResolvedValue({ id: 11 });

    await expect(
      service.create({ tipo: 'DNI', fechaVencimiento: diasDesdeHoy(0), personaId: 1 }, 7),
    ).resolves.toBeDefined();
  });

  it('rechaza una fecha de vencimiento anterior a hoy', async () => {
    prismaMock.persona.findUnique.mockResolvedValue({ id: 1 });

    await expect(
      service.create({ tipo: 'Seguro', fechaVencimiento: diasDesdeHoy(-1), personaId: 1 }, 7),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prismaMock.documentacion.create).not.toHaveBeenCalled();
  });

  it('rechaza cargar documentación para un participante inexistente', async () => {
    prismaMock.persona.findUnique.mockResolvedValue(null);

    await expect(
      service.create({ tipo: 'Apto físico', fechaVencimiento: diasDesdeHoy(10), personaId: 99 }, 7),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prismaMock.documentacion.create).not.toHaveBeenCalled();
  });
});
