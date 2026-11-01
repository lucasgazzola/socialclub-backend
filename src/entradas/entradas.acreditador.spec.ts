import type { OrdenPago } from '@prisma/client';
import { EntradasAcreditador } from './entradas.acreditador';
import { CompraEntradasPlantilla } from './compra-entradas.plantilla';

/** US-52 · TASK-51 (DT-31) / TASK-56 (DT-36) · Acreditación de la compra online de entradas y notificación. */
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
  let notificaciones: { notificar: jest.Mock };
  let plantilla: CompraEntradasPlantilla;
  let acreditador: EntradasAcreditador;

  beforeEach(() => {
    tx = {
      evento: {
        findUnique: jest.fn().mockResolvedValue({
          id: 1,
          nombre: 'Peña',
          entradasDisponibles: 8,
          fechaEvento: new Date('2026-11-20T21:00:00.000Z'),
          lugarAcreditacion: 'Sede Central',
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      compraEntrada: { create: jest.fn().mockResolvedValue({ id: 25 }) },
      entrada: { createMany: jest.fn() },
    };
    auditoria = { registrar: jest.fn() };
    notificaciones = {
      notificar: jest.fn().mockResolvedValue({ creadas: 1, enviadas: 1, fallidas: 0 }),
    };
    plantilla = new CompraEntradasPlantilla();
    acreditador = new EntradasAcreditador(auditoria as never, notificaciones as never, plantilla);
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

  it('DT-36 · notifica al comprador por email con el detalle de las entradas acreditadas', async () => {
    await acreditador.acreditar(orden, tx, { reservaVigente: true });

    expect(notificaciones.notificar).toHaveBeenCalledWith(
      expect.objectContaining({
        plantilla,
        destinatarios: [7],
        referencias: ['compra-entradas-25'],
        datos: expect.objectContaining({
          eventoNombre: 'Peña',
          cantidad: 2,
          precioUnitario: '$1500.00',
          montoTotal: '$3000.00',
        }),
      }),
    );
  });

  it('DT-36 · si la notificación falla, no aborta ni revierte la acreditación de la compra', async () => {
    notificaciones.notificar.mockRejectedValue(new Error('SMTP no disponible'));

    await expect(acreditador.acreditar(orden, tx, { reservaVigente: true })).resolves.not.toThrow();
    expect(tx.compraEntrada.create).toHaveBeenCalled();
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
    expect(notificaciones.notificar).not.toHaveBeenCalled();
  });

  it('falla si el evento ya no existe', async () => {
    tx.evento.findUnique.mockResolvedValue(null);
    await expect(acreditador.acreditar(orden, tx, { reservaVigente: true })).rejects.toThrow(
      'el evento ya no existe',
    );
    expect(notificaciones.notificar).not.toHaveBeenCalled();
  });

  it('TC-264 · liberar devuelve el cupo reservado al evento', async () => {
    await acreditador.liberar(orden, tx);

    expect(tx.evento.updateMany).toHaveBeenCalledWith({
      where: { id: 1, entradasDisponibles: { not: null } },
      data: { entradasDisponibles: { increment: 2 } },
    });
  });
});
