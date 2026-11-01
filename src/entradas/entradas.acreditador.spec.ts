import type { OrdenPago } from '@prisma/client';
import { EntradasAcreditador } from './entradas.acreditador';

/** US-52 · TASK-51 (DT-31) · Acreditación de la compra online de entradas. */
describe('US-52 · TASK-51 · EntradasAcreditador', () => {
  const orden = {
    id: 8,
    referencia: 'ref-8',
    usuarioId: 7,
    pasarela: 'MERCADO_PAGO',
    datos: { eventoId: 1, cantidad: 2, precioUnitario: 1500, montoTotal: 3000 },
  } as unknown as OrdenPago;

  let tx: any;
  let auditoria: { registrar: jest.Mock };
  let acreditador: EntradasAcreditador;

  beforeEach(() => {
    tx = {
      evento: {
        findUnique: jest.fn().mockResolvedValue({ id: 1, nombre: 'Peña', entradasDisponibles: 8 }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      compraEntrada: { create: jest.fn().mockResolvedValue({ id: 25 }) },
      entrada: { createMany: jest.fn() },
    };
    auditoria = { registrar: jest.fn() };
    acreditador = new EntradasAcreditador(auditoria as never);
  });

  it('TC-263 · crea la compra asociada a la orden y una entrada única por unidad', async () => {
    await acreditador.acreditar(orden, tx, { reservaVigente: true });

    expect(tx.compraEntrada.create).toHaveBeenCalledWith({
      data: {
        usuarioId: 7,
        eventoId: 1,
        cantidad: 2,
        precioUnitario: 1500,
        montoTotal: 3000,
        metodoPago: 'MERCADO_PAGO',
        ordenPagoId: 8,
      },
    });
    const entradas = tx.entrada.createMany.mock.calls[0][0].data;
    expect(entradas).toHaveLength(2);
    expect(new Set(entradas.map((e: { token: string }) => e.token)).size).toBe(2);
    expect(entradas[0]).toEqual(expect.objectContaining({ eventoId: 1, compraId: 25 }));
    expect(auditoria.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ entidad: 'CompraEntrada', idEntidad: 25 }),
      tx,
    );
  });

  it('con la reserva vigente no vuelve a descontar el cupo', async () => {
    await acreditador.acreditar(orden, tx, { reservaVigente: true });
    expect(tx.evento.updateMany).not.toHaveBeenCalled();
  });

  it('si la orden había vencido, vuelve a reservar el cupo', async () => {
    await acreditador.acreditar(orden, tx, { reservaVigente: false });

    expect(tx.evento.updateMany).toHaveBeenCalledWith({
      where: { id: 1, entradasDisponibles: { gte: 2 } },
      data: { entradasDisponibles: { decrement: 2 } },
    });
  });

  it('TC-266 · si venció y ya no hay cupo, falla sin crear la compra (queda en revisión)', async () => {
    tx.evento.updateMany.mockResolvedValue({ count: 0 });

    await expect(acreditador.acreditar(orden, tx, { reservaVigente: false })).rejects.toThrow(
      'la orden venció y las entradas se agotaron',
    );
    expect(tx.compraEntrada.create).not.toHaveBeenCalled();
  });

  it('falla si el evento ya no existe', async () => {
    tx.evento.findUnique.mockResolvedValue(null);
    await expect(acreditador.acreditar(orden, tx, { reservaVigente: true })).rejects.toThrow(
      'el evento ya no existe',
    );
  });

  it('TC-264 · liberar devuelve el cupo reservado al evento', async () => {
    await acreditador.liberar(orden, tx);

    expect(tx.evento.updateMany).toHaveBeenCalledWith({
      where: { id: 1, entradasDisponibles: { not: null } },
      data: { entradasDisponibles: { increment: 2 } },
    });
  });
});
