import type { OrdenPago } from '@prisma/client';
import { ReservaAcreditador } from './reserva.acreditador';
import { VencerSenasReservasTarea } from './vencer-senas-reservas.tarea';
import { ReservasPlantilla } from './reservas.plantilla';

/** US-60 · US-61 — Seña pagada online, tarea de vencimiento y aviso por email. */
describe('US-60/61 · seña online, vencimiento y aviso', () => {
  describe('ReservaAcreditador', () => {
    const orden = {
      id: 5,
      referencia: 'ref-5',
      usuarioId: 7,
      pasarela: 'MERCADO_PAGO',
      monto: 6000,
      datos: { reservaId: 10 },
    } as unknown as OrdenPago;
    let tx: { reserva: { updateMany: jest.Mock } };
    let auditoria: { registrar: jest.Mock };

    beforeEach(() => {
      tx = { reserva: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) } };
      auditoria = { registrar: jest.fn() };
    });

    it('TC-279 · confirma la reserva aprobada y guarda método y orden de la seña', async () => {
      await new ReservaAcreditador(auditoria as never).acreditar(orden, tx as never);

      expect(tx.reserva.updateMany).toHaveBeenCalledWith({
        where: { id: 10, estado: 'APROBADA_PENDIENTE_PAGO' },
        data: expect.objectContaining({
          estado: 'CONFIRMADA',
          metodoPagoSena: 'MERCADO_PAGO',
          ordenPagoId: 5,
        }),
      });
      expect(auditoria.registrar).toHaveBeenCalledWith(
        expect.objectContaining({ entidad: 'Reserva', idEntidad: 10, responsableId: 7 }),
        tx,
      );
    });

    it('si la reserva se canceló mientras pagaba, falla (la orden queda en revisión)', async () => {
      tx.reserva.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        new ReservaAcreditador(auditoria as never).acreditar(orden, tx as never),
      ).rejects.toThrow('la reserva ya no estaba aprobada pendiente de pago');
      expect(auditoria.registrar).not.toHaveBeenCalled();
    });
  });

  it('TC-282 · la tarea vencer-senas-reservas delega en el servicio', async () => {
    const reservas = { vencerSenas: jest.fn().mockResolvedValue({ revisadas: 1, canceladas: 1 }) };
    const tarea = new VencerSenasReservasTarea(reservas as never);
    const hoy = new Date();

    await expect(tarea.ejecutar({ hoy })).resolves.toEqual({ revisadas: 1, canceladas: 1 });
    expect(reservas.vencerSenas).toHaveBeenCalledWith(hoy);
    expect(tarea.nombre).toBe('vencer-senas-reservas');
  });

  describe('ReservasPlantilla', () => {
    const plantilla = new ReservasPlantilla();
    const base = {
      codigo: 'RES-ABC234',
      espacio: 'Quincho',
      turno: 'sáb 07/11/2026 (día completo)',
    };

    it('el rechazo incluye el motivo', () => {
      const email = plantilla.email(
        { ...base, novedad: 'RECHAZADA', motivo: 'Fecha de <evento>' },
        {},
      );
      expect(email.asunto).toBe(
        'SocialClub · Reserva RES-ABC234: tu solicitud de reserva fue rechazada',
      );
      expect(email.texto).toContain('Motivo: Fecha de <evento>');
      expect(email.html).toContain('Fecha de &lt;evento&gt;');
    });

    it('la aprobación incluye la seña y la fecha límite', () => {
      const email = plantilla.email(
        { ...base, novedad: 'APROBADA', sena: '$6.000,00', limitePago: 'lun 02/11/2026 18:00' },
        { appUrl: 'https://socialclub.app' },
      );
      expect(email.texto).toContain('Seña: $6.000,00');
      expect(email.texto).toContain('Pagar antes del: lun 02/11/2026 18:00');
      expect(email.html).toContain('https://socialclub.app');
    });

    it('arma un aviso para cada novedad', () => {
      for (const novedad of ['CANCELADA_INSTITUCION', 'CANCELADA_FALTA_PAGO'] as const) {
        expect(plantilla.email({ ...base, novedad }, {}).asunto).toContain('RES-ABC234');
      }
      expect(
        plantilla.contenidoPara('EMAIL', { ...base, novedad: 'RECHAZADA' }, {}),
      ).not.toBeNull();
    });
  });
});
