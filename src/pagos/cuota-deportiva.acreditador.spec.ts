import { ConflictException } from '@nestjs/common';
import type { OrdenPago } from '@prisma/client';
import { CuotaDeportivaAcreditador } from './cuota-deportiva.acreditador';

/** DT-35 · Acreditación del pago online de cuotas deportivas. */
describe('DT-35 · CuotaDeportivaAcreditador', () => {
  const orden = {
    id: 8,
    referencia: 'ref-8',
    usuarioId: 7,
    pasarela: 'SIMULADA',
    datos: {
      personaId: 50,
      items: [
        { disciplinaId: 3, periodo: '2026-07', monto: 4000 },
        { disciplinaId: 4, periodo: '2026-07', monto: 2500 },
      ],
    },
  } as unknown as OrdenPago;

  let tx: { pagoCuotaDeportiva: { findMany: jest.Mock; create: jest.Mock } };
  let auditoria: { registrar: jest.Mock };
  let acreditador: CuotaDeportivaAcreditador;

  beforeEach(() => {
    tx = {
      pagoCuotaDeportiva: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn((args: { data: { disciplinaId: number } }) =>
          Promise.resolve({ id: args.data.disciplinaId }),
        ),
      },
    };
    auditoria = { registrar: jest.fn() };
    acreditador = new CuotaDeportivaAcreditador(auditoria as never);
  });

  it('registra un pago por disciplina y período, con la pasarela y la orden', async () => {
    await acreditador.acreditar(orden, tx as never);

    expect(tx.pagoCuotaDeportiva.create).toHaveBeenCalledTimes(2);
    expect(tx.pagoCuotaDeportiva.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        personaId: 50,
        disciplinaId: 4,
        periodo: '2026-07',
        monto: 2500,
        metodoPago: 'SIMULADA',
        ordenPagoId: 8,
        responsableId: 7,
      }),
    });
    expect(auditoria.registrar).toHaveBeenCalledWith(
      expect.objectContaining({
        accion: 'CREAR',
        entidad: 'PagoCuotaDeportiva',
        idEntidad: 4,
        responsableId: 7,
      }),
      tx,
    );
  });

  it('si secretaría cobró algún período mientras tanto, no acredita nada', async () => {
    tx.pagoCuotaDeportiva.findMany.mockResolvedValue([{ disciplinaId: 3, periodo: '2026-07' }]);

    await expect(acreditador.acreditar(orden, tx as never)).rejects.toThrow(
      new ConflictException('el/los período(s) [3/2026-07] ya figuraban como pagados'),
    );
    expect(tx.pagoCuotaDeportiva.create).not.toHaveBeenCalled();
  });
});
