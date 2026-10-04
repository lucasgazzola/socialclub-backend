import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { EntradasService } from './entradas.service';

/**
 * US-31 · DT-33 · Control de acceso con QR y vencimiento de las entradas: una
 * entrada vale hasta que termina su evento, y no se generan entradas para
 * eventos terminados o cancelados.
 */
describe('US-31/DT-33 · EntradasService · acceso y vencimiento', () => {
  let service: EntradasService;
  const DIA = 24 * 60 * 60 * 1000;
  const prismaMock = {
    evento: { findUnique: jest.fn() },
    entrada: { findUnique: jest.fn(), updateMany: jest.fn() },
    $transaction: jest.fn(),
  };
  const auditoriaMock = { registrar: jest.fn() };

  const evento = (extra: Record<string, unknown> = {}) => ({
    id: 3,
    nombre: 'Cena aniversario',
    estado: 'PUBLICADO',
    requiereEntrada: true,
    entradasDisponibles: 50,
    precio: 0,
    descuentoSocio: 0,
    inicioVenta: null,
    finVenta: null,
    fechaEvento: new Date(Date.now() + 2 * DIA),
    fechaFin: null,
    ...extra,
  });
  const entrada = (estado: string, ev = evento()) => ({
    id: 40,
    token: 'tok-1',
    eventoId: ev.id,
    estado,
    evento: ev,
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

  describe('validarAcceso', () => {
    it('permite el acceso con una entrada válida de un evento vigente y la marca USADA', async () => {
      prismaMock.entrada.findUnique.mockResolvedValue(entrada('VALIDA'));
      prismaMock.entrada.updateMany.mockResolvedValue({ count: 1 });

      await expect(service.validarAcceso({ token: 'tok-1' }, 7)).resolves.toEqual({
        acceso: 'PERMITIDO',
        entrada: { id: 40, eventoId: 3, eventoNombre: 'Cena aniversario' },
      });
      expect(prismaMock.entrada.updateMany).toHaveBeenCalledWith({
        where: { token: 'tok-1', estado: 'VALIDA' },
        data: { estado: 'USADA' },
      });
      expect(auditoriaMock.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          accion: 'EDITAR',
          entidad: 'Entrada',
          idEntidad: 40,
          responsableId: 7,
        }),
      );
    });

    it('rechaza una entrada válida de un evento que ya terminó y la marca EXPIRADA', async () => {
      const terminado = evento({
        fechaEvento: new Date(Date.now() - 2 * DIA),
        fechaFin: new Date(Date.now() - DIA),
      });
      prismaMock.entrada.findUnique.mockResolvedValue(entrada('VALIDA', terminado));
      prismaMock.entrada.updateMany.mockResolvedValue({ count: 1 });

      await expect(service.validarAcceso({ token: 'tok-1' }, 7)).rejects.toThrow(
        new BadRequestException('Entrada expirada para el evento "Cena aniversario".'),
      );
      expect(prismaMock.entrada.updateMany).toHaveBeenCalledWith({
        where: { id: 40, estado: 'VALIDA' },
        data: { estado: 'EXPIRADA' },
      });
      expect(auditoriaMock.registrar).not.toHaveBeenCalled();
    });

    it('sin fecha de fin, la entrada vence 12 horas después del inicio', async () => {
      const haceTreceHoras = evento({ fechaEvento: new Date(Date.now() - 13 * 60 * 60 * 1000) });
      prismaMock.entrada.findUnique.mockResolvedValue(entrada('VALIDA', haceTreceHoras));
      prismaMock.entrada.updateMany.mockResolvedValue({ count: 1 });

      await expect(service.validarAcceso({ token: 'tok-1' }, 7)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rechaza una entrada ya marcada EXPIRADA', async () => {
      prismaMock.entrada.findUnique.mockResolvedValue(entrada('EXPIRADA'));

      await expect(service.validarAcceso({ token: 'tok-1' }, 7)).rejects.toThrow(
        'Entrada expirada para el evento "Cena aniversario".',
      );
      expect(prismaMock.entrada.updateMany).not.toHaveBeenCalled();
    });

    it('rechaza una entrada ya usada (posible reingreso)', async () => {
      prismaMock.entrada.findUnique.mockResolvedValue(entrada('USADA'));

      await expect(service.validarAcceso({ token: 'tok-1' }, 7)).rejects.toThrow(ConflictException);
    });

    it('rechaza un QR que no corresponde a ninguna entrada', async () => {
      prismaMock.entrada.findUnique.mockResolvedValue(null);

      await expect(service.validarAcceso({ token: 'x' }, 7)).rejects.toThrow(
        new NotFoundException('Entrada no encontrada. El código QR no es válido.'),
      );
    });

    it('si otra validación la usó en el medio, rechaza el reingreso', async () => {
      prismaMock.entrada.findUnique.mockResolvedValue(entrada('VALIDA'));
      prismaMock.entrada.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.validarAcceso({ token: 'tok-1' }, 7)).rejects.toThrow(
        'La entrada ya fue utilizada o no es válida.',
      );
    });
  });

  describe('crearMultiples', () => {
    it.each([
      [
        'terminado',
        { fechaEvento: new Date(Date.now() - 2 * DIA), fechaFin: new Date(Date.now() - DIA) },
      ],
      ['cancelado', { estado: 'CANCELADO' }],
      ['finalizado', { estado: 'FINALIZADO' }],
    ])('no genera entradas para un evento %s', async (_caso, extra) => {
      prismaMock.evento.findUnique.mockResolvedValue(evento(extra));

      await expect(service.crearMultiples({ eventoId: 3, cantidad: 2 }, 1)).rejects.toThrow(
        new BadRequestException(
          'No se pueden generar entradas: el evento "Cena aniversario" ya terminó o fue cancelado.',
        ),
      );
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('comprar', () => {
    it('no vende entradas de un evento que ya terminó, aunque la venta no tenga cierre', async () => {
      prismaMock.evento.findUnique.mockResolvedValue(
        evento({
          fechaEvento: new Date(Date.now() - 2 * DIA),
          fechaFin: new Date(Date.now() - DIA),
        }),
      );

      await expect(service.comprar({ eventoId: 3, cantidad: 1 } as never, 9)).rejects.toThrow(
        new BadRequestException('El evento ya terminó.'),
      );
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });
  });
});
