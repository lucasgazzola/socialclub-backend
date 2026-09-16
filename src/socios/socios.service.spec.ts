import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { SociosService } from './socios.service';

/**
 * Ejemplo de test unitario con dependencias mockeadas. Sirve de plantilla para
 * que el equipo cubra el resto de los servicios (DoD: cobertura mínima 70%).
 */
describe('SociosService', () => {
  let service: SociosService;
  const prismaMock = {
    persona: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  };
  const auditoriaMock = { registrar: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        SociosService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuditoriaService, useValue: auditoriaMock },
      ],
    }).compile();

    service = moduleRef.get(SociosService);
  });

  it('registra un socio y deja constancia en auditoría', async () => {
    prismaMock.persona.findUnique.mockResolvedValue(null);
    prismaMock.persona.create.mockResolvedValue({ id: 1, dni: '40123456' });

    const resultado = await service.create(
      { nombre: 'Lucas', apellido: 'Gazzola', dni: '40123456' },
      99,
    );

    expect(resultado.id).toBe(1);
    expect(auditoriaMock.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ accion: 'CREAR', entidad: 'Persona', responsableId: 99 }),
    );
  });

  it('rechaza un socio con DNI duplicado', async () => {
    prismaMock.persona.findUnique.mockResolvedValue({ id: 1, dni: '40123456' });

    await expect(
      service.create({ nombre: 'Otro', apellido: 'Socio', dni: '40123456' }, 99),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
