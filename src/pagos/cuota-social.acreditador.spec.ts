import { ConflictException } from '@nestjs/common';
import type { OrdenPago } from '@prisma/client';
import { CuotaSocialAcreditador } from './cuota-social.acreditador';

/** US-10 · TASK-51 · Acreditación del pago online de cuotas sociales. */
describe('US-10 · TASK-51 · CuotaSocialAcreditador', () => {
  const orden = {
    id: 4,
    referencia: 'ref-4',
    usuarioId: 7,
    pasarela: 'MERCADO_PAGO',
    datos: {
      personaId: 10,
      periodos: [
        { periodo: '2026-09', monto: 12000 },
        { periodo: '2026-10', monto: 12500 },
      ],
    },
  } as unknown as OrdenPago;

  let tx: { pago: { findMany: jest.Mock; create: jest.Mock } };
  let auditoria: { registrar: jest.Mock };
  let acreditador: CuotaSocialAcreditador;

  beforeEach(() => {
    tx = {
      pago: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn((args: { data: { periodo: string } }) =>
          Promise.resolve({ id: args.data.periodo === '2026-09' ? 1 : 2 }),
        ),
      },
    };
    auditoria = { registrar: jest.fn() };
    acreditador = new CuotaSocialAcreditador(auditoria as never);
  });

  it('TC-259 · registra un pago por período con el monto cotizado, la pasarela y la orden', async () => {
    await acreditador.acreditar(orden, tx as never);

    expect(tx.pago.create).toHaveBeenCalledTimes(2);
    expect(tx.pago.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        personaId: 10,
        periodo: '2026-10',
        monto: 12500,
        metodoPago: 'MERCADO_PAGO',
        ordenPagoId: 4,
      }),
    });
    expect(auditoria.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ accion: 'CREAR', entidad: 'Pago', idEntidad: 2, responsableId: 7 }),
      tx,
    );
  });

  it('TC-262 · si secretaría cobró algún período mientras tanto, no acredita nada', async () => {
    tx.pago.findMany.mockResolvedValue([{ periodo: '2026-09' }]);

    await expect(acreditador.acreditar(orden, tx as never)).rejects.toThrow(
      new ConflictException('el/los período(s) [2026-09] ya figuraban como pagados'),
    );
    expect(tx.pago.create).not.toHaveBeenCalled();
  });
});
