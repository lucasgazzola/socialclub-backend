import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { EntradasService } from './entradas.service';

/**
 * Tests unitarios de la validación de acceso por QR (US-31), con dependencias
 * mockeadas (mismo patrón que el resto de los servicios).
 */
describe('EntradasService — validarAcceso (US-31)', () => {
  let service: EntradasService;

  const prismaMock = {
    entrada: {
      updateMany: jest.fn(),
      findUnique: jest.fn(),
    },
  };
  const auditoriaMock = { registrar: jest.fn() };

  const entradaConEvento = (estado: string) => ({
    id: 5,
    token: 'tok-123',
    estado,
    evento: { id: 2, nombre: 'Peña Folklórica' },
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        EntradasService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuditoriaService, useValue: auditoriaMock },
      ],
    }).compile();
    service = moduleRef.get(EntradasService);
  });

  it('permite el acceso con una entrada VALIDA y la marca como USADA', async () => {
    // updateMany consume la entrada (estaba VALIDA) → count 1.
    prismaMock.entrada.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.entrada.findUnique.mockResolvedValue(entradaConEvento('USADA'));

    const res = await service.validarAcceso('tok-123', 9);

    expect(prismaMock.entrada.updateMany).toHaveBeenCalledWith({
      where: { token: 'tok-123', estado: 'VALIDA' },
      data: { estado: 'USADA' },
    });
    expect(res.valido).toBe(true);
    expect(res.estado).toBe('VALIDA');
    expect(res.entrada?.evento.nombre).toBe('Peña Folklórica');
    expect(auditoriaMock.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ entidad: 'Entrada', idEntidad: 5 }),
    );
  });

  it('rechaza el acceso si la entrada ya fue utilizada', async () => {
    prismaMock.entrada.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.entrada.findUnique.mockResolvedValue(entradaConEvento('USADA'));

    const res = await service.validarAcceso('tok-123', 9);

    expect(res.valido).toBe(false);
    expect(res.estado).toBe('USADA');
    expect(res.motivo).toMatch(/utilizada/i);
    expect(auditoriaMock.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ detalle: expect.stringContaining('RECHAZADO') }),
    );
  });

  it('rechaza el acceso si la entrada está expirada', async () => {
    prismaMock.entrada.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.entrada.findUnique.mockResolvedValue(entradaConEvento('EXPIRADA'));

    const res = await service.validarAcceso('tok-123', 9);

    expect(res.valido).toBe(false);
    expect(res.estado).toBe('EXPIRADA');
  });

  it('rechaza el acceso si el token no existe', async () => {
    prismaMock.entrada.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.entrada.findUnique.mockResolvedValue(null);

    const res = await service.validarAcceso('inexistente', 9);

    expect(res.valido).toBe(false);
    expect(res.estado).toBe('NO_ENCONTRADA');
    expect(res.entrada).toBeNull();
  });
});
