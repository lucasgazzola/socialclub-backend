import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { ReservasService, enHoraClub, turnoLegible } from './reservas.service';
import { ReservasPlantilla } from './reservas.plantilla';

/**
 * US-60 · US-61 · US-62 — Evaluación, cancelación y consulta de reservas.
 * Prisma, auditoría, notificaciones, pagos y pasarela simulados.
 */
describe('US-60/61/62 · ReservasService', () => {
  const H = 3_600_000;
  const ahora = Date.now();

  const reserva = (extra: Record<string, unknown> = {}) => ({
    id: 10,
    codigo: 'RES-ABC234',
    espacioId: 1,
    usuarioId: 7,
    inicio: new Date(ahora + 7 * 24 * H),
    fin: new Date(ahora + 7 * 24 * H + 2 * H),
    estado: 'PENDIENTE_APROBACION',
    esSocio: true,
    montoTotal: 24000,
    montoSena: 6000,
    observaciones: null,
    limitePagoSena: null,
    senaPagadaEn: null,
    metodoPagoSena: null,
    motivoRechazo: null,
    motivoCancelacion: null,
    creadoEn: new Date(ahora - H),
    espacio: { id: 1, nombre: 'Cancha de fútbol 5', modalidad: 'POR_HORA' },
    usuario: {
      id: 7,
      email: 'lucia@club.local',
      persona: {
        id: 30,
        nombre: 'Lucía',
        apellido: 'Registrada',
        dni: '30000003',
        telefono: '3534000000',
        membresias: [{ id: 1 }],
      },
    },
    ...extra,
  });

  let prisma: any;
  let tx: any;
  let auditoria: { registrar: jest.Mock };
  let notificaciones: { notificar: jest.Mock };
  let pagos: { getCuotasPendientesPorSocio: jest.Mock };
  let pasarela: { iniciarCobro: jest.Mock };
  let config: Record<string, unknown>;
  let service: ReservasService;

  /** Lo que devuelve `findUnique`: primero el estado actual, después el actualizado. */
  const encadenar = (...estados: Record<string, unknown>[]) => {
    for (const e of estados) prisma.reserva.findUnique.mockResolvedValueOnce(reserva(e));
  };

  beforeEach(() => {
    tx = { reserva: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) } };
    prisma = {
      reserva: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      bloqueoAgenda: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((cb: (t: unknown) => unknown) => cb(tx)),
    };
    auditoria = { registrar: jest.fn() };
    notificaciones = { notificar: jest.fn().mockResolvedValue({}) };
    pagos = {
      getCuotasPendientesPorSocio: jest
        .fn()
        .mockResolvedValue({ cuotasPendientes: [{}, {}], totalAdeudado: 20000 }),
    };
    pasarela = {
      iniciarCobro: jest.fn().mockResolvedValue({ referencia: 'ref', urlPago: 'https://pagar' }),
    };
    config = {};
    service = new ReservasService(
      prisma,
      auditoria as never,
      notificaciones as never,
      new ReservasPlantilla(),
      pagos as never,
      pasarela as never,
      { get: (k: string) => config[k] } as unknown as ConfigService,
    );
  });

  describe('US-60 · bandeja de solicitudes', () => {
    it('TC-273 · lista las pendientes ordenadas por fecha del turno y de solicitud', async () => {
      prisma.reserva.findMany.mockResolvedValueOnce([reserva()]);

      await service.listarSolicitudes();

      expect(prisma.reserva.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { estado: { in: ['PENDIENTE_APROBACION'] } },
          orderBy: [{ inicio: 'asc' }, { creadoEn: 'asc' }],
        }),
      );
    });

    it('TC-274 · muestra nombre, DNI, teléfono y condición de socio/deuda del solicitante', async () => {
      prisma.reserva.findMany.mockResolvedValueOnce([reserva()]);

      const [fila] = await service.listarSolicitudes();

      expect(fila.solicitante).toEqual({
        usuarioId: 7,
        nombre: 'Lucía Registrada',
        dni: '30000003',
        telefono: '3534000000',
        email: 'lucia@club.local',
        esSocio: true,
        cuotasAdeudadas: 2,
        deuda: 20000,
      });
      expect(fila).toEqual(
        expect.objectContaining({ codigo: 'RES-ABC234', montoTotal: 24000, montoSena: 6000 }),
      );
      expect(fila.espacio.nombre).toBe('Cancha de fútbol 5');
    });

    it('TC-274 · a un no socio no le calcula deuda', async () => {
      const r = reserva();
      r.usuario.persona.membresias = [];
      prisma.reserva.findMany.mockResolvedValueOnce([r]);

      const [fila] = await service.listarSolicitudes();

      expect(fila.solicitante).toEqual(expect.objectContaining({ esSocio: false, deuda: 0 }));
      expect(pagos.getCuotasPendientesPorSocio).not.toHaveBeenCalled();
    });

    it('TC-276 · avisa en la bandeja si el turno pedido ya está ocupado', async () => {
      prisma.reserva.findMany.mockResolvedValueOnce([reserva()]).mockResolvedValueOnce([
        {
          id: 11,
          codigo: 'RES-OTRA22',
          estado: 'CONFIRMADA',
          inicio: reserva().inicio,
          fin: reserva().fin,
        },
      ]);

      const [fila] = await service.listarSolicitudes();

      expect(fila.conflictos).toEqual([
        expect.objectContaining({ tipo: 'RESERVA', detalle: 'Reserva RES-OTRA22' }),
      ]);
    });

    it('filtra por estado y busca por nombre, DNI o código', async () => {
      await service.listarSolicitudes({ estado: ['CONFIRMADA'], busqueda: ' 3000 ' });

      const { where } = prisma.reserva.findMany.mock.calls[0][0];
      expect(where.estado).toEqual({ in: ['CONFIRMADA'] });
      expect(where.OR).toEqual(
        expect.arrayContaining([{ usuario: { persona: { dni: { contains: '3000' } } } }]),
      );
    });
  });

  describe('US-60 · aprobar', () => {
    it('TC-275 · pasa a aprobada pendiente de pago con plazo de 48 h, audita y avisa', async () => {
      encadenar(
        {},
        { estado: 'APROBADA_PENDIENTE_PAGO', limitePagoSena: new Date(ahora + 48 * H) },
      );

      const res = await service.aprobar(10, 1);

      const { where, data } = tx.reserva.updateMany.mock.calls[0][0];
      expect(where).toEqual({ id: 10, estado: { in: ['PENDIENTE_APROBACION'] } });
      expect(data.estado).toBe('APROBADA_PENDIENTE_PAGO');
      expect(data.evaluadaPorId).toBe(1);
      expect(Math.abs(data.limitePagoSena.getTime() - (Date.now() + 48 * H))).toBeLessThan(5000);
      expect(auditoria.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          accion: 'EDITAR',
          entidad: 'Reserva',
          idEntidad: 10,
          responsableId: 1,
        }),
        tx,
      );
      expect(notificaciones.notificar).toHaveBeenCalledWith(
        expect.objectContaining({
          destinatarios: [7],
          datos: expect.objectContaining({ novedad: 'APROBADA', sena: '$6.000,00' }),
        }),
      );
      expect(res.mensaje).toMatch(/^Solicitud RES-ABC234 aprobada\. El turno quedó bloqueado/);
    });

    it('TC-275 · el plazo de la seña es configurable', async () => {
      config.RESERVAS_HORAS_LIMITE_SENA = 24;
      encadenar({}, { estado: 'APROBADA_PENDIENTE_PAGO' });

      await service.aprobar(10, 1);

      const { data } = tx.reserva.updateMany.mock.calls[0][0];
      expect(Math.abs(data.limitePagoSena.getTime() - (Date.now() + 24 * H))).toBeLessThan(5000);
    });

    it('TC-276 · no aprueba si el turno ya lo ocupa otra reserva aprobada (409)', async () => {
      encadenar({});
      prisma.reserva.findMany.mockResolvedValueOnce([
        {
          id: 11,
          codigo: 'RES-OTRA22',
          estado: 'APROBADA_PENDIENTE_PAGO',
          inicio: reserva().inicio,
          fin: reserva().fin,
        },
      ]);

      await expect(service.aprobar(10, 1)).rejects.toThrow(
        expect.objectContaining({
          message: expect.stringMatching(
            /^El turno ya no está disponible: se superpone con Reserva RES-OTRA22/,
          ),
        }),
      );
      expect(tx.reserva.updateMany).not.toHaveBeenCalled();
    });

    it('no aprueba una reserva que no está pendiente', async () => {
      encadenar({ estado: 'RECHAZADA' });
      await expect(service.aprobar(10, 1)).rejects.toThrow(
        new BadRequestException('Solo se pueden aprobar solicitudes pendientes de aprobación'),
      );
    });

    it('si otro evaluador la cambió mientras tanto, responde conflicto sin pisarla', async () => {
      encadenar({});
      tx.reserva.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.aprobar(10, 1)).rejects.toBeInstanceOf(ConflictException);
      expect(auditoria.registrar).not.toHaveBeenCalled();
    });

    it('404 si la reserva no existe', async () => {
      prisma.reserva.findUnique.mockResolvedValueOnce(null);
      await expect(service.aprobar(99, 1)).rejects.toThrow(
        new NotFoundException('Reserva no encontrada'),
      );
    });
  });

  describe('US-60 · rechazar', () => {
    it('TC-277 · guarda el motivo, pasa a rechazada y avisa al solicitante con el motivo', async () => {
      encadenar({}, { estado: 'RECHAZADA', motivoRechazo: 'Salón ocupado por un evento' });

      const res = await service.rechazar(10, 'Salón ocupado por un evento', 1);

      expect(tx.reserva.updateMany.mock.calls[0][0].data).toEqual(
        expect.objectContaining({
          estado: 'RECHAZADA',
          motivoRechazo: 'Salón ocupado por un evento',
        }),
      );
      expect(notificaciones.notificar).toHaveBeenCalledWith(
        expect.objectContaining({
          datos: expect.objectContaining({
            novedad: 'RECHAZADA',
            motivo: 'Salón ocupado por un evento',
          }),
        }),
      );
      expect(res.mensaje).toBe('Solicitud RES-ABC234 rechazada. Le avisamos al solicitante.');
    });

    it('un aviso que falla no deshace el rechazo', async () => {
      encadenar({}, { estado: 'RECHAZADA' });
      notificaciones.notificar.mockRejectedValue(new Error('SMTP caído'));

      await expect(service.rechazar(10, 'Motivo válido', 1)).resolves.toBeDefined();
    });

    it('no rechaza una reserva ya aprobada', async () => {
      encadenar({ estado: 'APROBADA_PENDIENTE_PAGO' });
      await expect(service.rechazar(10, 'Motivo válido', 1)).rejects.toThrow(
        'Solo se pueden rechazar solicitudes pendientes de aprobación',
      );
    });
  });

  describe('US-60 · seña', () => {
    it('TC-278 · secretaría registra la seña y la reserva queda confirmada', async () => {
      encadenar({ estado: 'APROBADA_PENDIENTE_PAGO' }, { estado: 'CONFIRMADA' });

      const res = await service.registrarSena(10, 'EFECTIVO', 1);

      expect(tx.reserva.updateMany.mock.calls[0][0].data).toEqual(
        expect.objectContaining({ estado: 'CONFIRMADA', metodoPagoSena: 'EFECTIVO' }),
      );
      expect(res.mensaje).toBe('Seña registrada. La reserva RES-ABC234 quedó confirmada.');
    });

    it('no registra seña de una reserva que no está aprobada pendiente de pago', async () => {
      encadenar({ estado: 'PENDIENTE_APROBACION' });
      await expect(service.registrarSena(10, 'EFECTIVO', 1)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('TC-279 · el solicitante inicia el pago online de la seña con la pasarela', async () => {
      encadenar({ estado: 'APROBADA_PENDIENTE_PAGO', limitePagoSena: new Date(ahora + H) });

      await expect(service.iniciarPagoSena(10, 7)).resolves.toEqual({
        referencia: 'ref',
        urlPago: 'https://pagar',
      });
      expect(pasarela.iniciarCobro).toHaveBeenCalledWith(
        expect.objectContaining({
          concepto: 'RESERVA',
          usuarioId: 7,
          items: [
            {
              titulo: 'Seña reserva RES-ABC234 — Cancha de fútbol 5',
              cantidad: 1,
              precioUnitario: 6000,
            },
          ],
          datos: { reservaId: 10 },
        }),
      );
    });

    it('no deja pagar la seña de otro usuario ni con el plazo vencido', async () => {
      encadenar({ estado: 'APROBADA_PENDIENTE_PAGO' });
      await expect(service.iniciarPagoSena(10, 99)).rejects.toBeInstanceOf(ForbiddenException);

      encadenar({ estado: 'APROBADA_PENDIENTE_PAGO', limitePagoSena: new Date(ahora - H) });
      await expect(service.iniciarPagoSena(10, 7)).rejects.toThrow(
        'Venció el plazo para pagar la seña. Comunicate con la secretaría del club.',
      );
      expect(pasarela.iniciarCobro).not.toHaveBeenCalled();
    });
  });

  describe('US-61 · cancelar', () => {
    it('TC-284 · el solicitante cancela antes del plazo de penalización y el turno queda libre', async () => {
      encadenar({ estado: 'CONFIRMADA' }, { estado: 'CANCELADA_USUARIO' });

      const res = await service.cancelarPorUsuario(10, 7);

      expect(tx.reserva.updateMany.mock.calls[0][0]).toEqual(
        expect.objectContaining({
          where: {
            id: 10,
            estado: { in: ['PENDIENTE_APROBACION', 'APROBADA_PENDIENTE_PAGO', 'CONFIRMADA'] },
          },
          data: expect.objectContaining({ estado: 'CANCELADA_USUARIO', canceladaPorId: 7 }),
        }),
      );
      expect(auditoria.registrar).toHaveBeenCalledWith(
        expect.objectContaining({ accion: 'BAJA' }),
        tx,
      );
      expect(res.mensaje).toBe('Cancelaste la reserva RES-ABC234. El turno quedó libre.');
    });

    it('TC-285 · pasado el plazo de penalización (48 h antes del turno) no puede cancelar solo', async () => {
      encadenar({ estado: 'CONFIRMADA', inicio: new Date(ahora + 24 * H) });
      await expect(service.cancelarPorUsuario(10, 7)).rejects.toThrow(
        /^Solo podés cancelar hasta 48 horas antes del turno/,
      );
    });

    it('TC-285 · el plazo de penalización es configurable', async () => {
      config.RESERVAS_HORAS_PENALIZACION = 12;
      encadenar(
        { estado: 'CONFIRMADA', inicio: new Date(ahora + 24 * H) },
        { estado: 'CANCELADA_USUARIO' },
      );
      await expect(service.cancelarPorUsuario(10, 7)).resolves.toBeDefined();
    });

    it('no cancela reservas de otro usuario ni las que ya no están vigentes', async () => {
      encadenar({});
      await expect(service.cancelarPorUsuario(10, 99)).rejects.toBeInstanceOf(ForbiddenException);
      encadenar({ estado: 'RECHAZADA' });
      await expect(service.cancelarPorUsuario(10, 7)).rejects.toThrow(
        'La reserva ya no está vigente: fue rechazada o cancelada',
      );
    });

    it('TC-283 · la institución cancela una confirmada con motivo, avisa y anota que hay que devolver la seña', async () => {
      encadenar(
        { estado: 'CONFIRMADA' },
        { estado: 'CANCELADA_INSTITUCION', motivoCancelacion: 'Torneo oficial' },
      );

      await service.cancelarPorInstitucion(10, 'Torneo oficial', 1);

      expect(tx.reserva.updateMany.mock.calls[0][0].data).toEqual(
        expect.objectContaining({
          estado: 'CANCELADA_INSTITUCION',
          motivoCancelacion: 'Torneo oficial',
        }),
      );
      expect(auditoria.registrar).toHaveBeenCalledWith(
        expect.objectContaining({ detalle: expect.stringContaining('corresponde devolverla') }),
        tx,
      );
      expect(notificaciones.notificar).toHaveBeenCalledWith(
        expect.objectContaining({
          datos: expect.objectContaining({ novedad: 'CANCELADA_INSTITUCION' }),
        }),
      );
    });

    it('TC-283 · una solicitud pendiente se rechaza, no se cancela por la institución', async () => {
      encadenar({ estado: 'PENDIENTE_APROBACION' });
      await expect(service.cancelarPorInstitucion(10, 'Motivo válido', 1)).rejects.toThrow(
        'Una solicitud pendiente se rechaza, no se cancela',
      );
    });

    it('TC-281 · cancela por falta de pago una reserva con la seña vencida', async () => {
      encadenar(
        { estado: 'APROBADA_PENDIENTE_PAGO', limitePagoSena: new Date(ahora - H) },
        { estado: 'CANCELADA_FALTA_PAGO' },
      );

      await service.cancelarPorFaltaPago(10, 1);

      expect(tx.reserva.updateMany.mock.calls[0][0].data.estado).toBe('CANCELADA_FALTA_PAGO');
      expect(notificaciones.notificar).toHaveBeenCalledWith(
        expect.objectContaining({
          datos: expect.objectContaining({ novedad: 'CANCELADA_FALTA_PAGO' }),
        }),
      );
    });

    it('TC-281 · no cancela por falta de pago si la seña todavía está en plazo', async () => {
      encadenar({ estado: 'APROBADA_PENDIENTE_PAGO', limitePagoSena: new Date(ahora + H) });
      await expect(service.cancelarPorFaltaPago(10, 1)).rejects.toThrow(
        /^El plazo para pagar la seña todavía no venció/,
      );
    });

    it('TC-282 · la tarea cancela las vencidas y sigue si alguna cambió mientras tanto', async () => {
      prisma.reserva.findMany.mockResolvedValueOnce([{ id: 10 }, { id: 11 }]);
      encadenar(
        { estado: 'APROBADA_PENDIENTE_PAGO', limitePagoSena: new Date(ahora - H) },
        { estado: 'CANCELADA_FALTA_PAGO' },
        { id: 11, estado: 'CONFIRMADA' },
      );

      const hoy = new Date();
      await expect(service.vencerSenas(hoy)).resolves.toEqual({ revisadas: 2, canceladas: 1 });
      expect(prisma.reserva.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { estado: 'APROBADA_PENDIENTE_PAGO', limitePagoSena: { lt: hoy } },
        }),
      );
    });
  });

  describe('US-62 · Mis Reservas', () => {
    it('TC-286 · lista las reservas del usuario de la más reciente a la más antigua', async () => {
      prisma.reserva.findMany.mockResolvedValueOnce([reserva()]);

      await service.misReservas(7);

      expect(prisma.reserva.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { usuarioId: 7 }, orderBy: { creadoEn: 'desc' } }),
      );
    });

    it('TC-286 · muestra código, espacio, turno y monto, y si puede cancelar', async () => {
      prisma.reserva.findMany.mockResolvedValueOnce([reserva()]);

      const [r] = await service.misReservas(7);

      expect(r).toEqual(
        expect.objectContaining({
          codigo: 'RES-ABC234',
          montoTotal: 24000,
          puedeCancelar: true,
          puedePagarSena: false,
          instruccionesSena: null,
        }),
      );
      expect(r.turno).toMatch(/ a \d{2}:\d{2}$/);
    });

    it('TC-287 · una aprobada pendiente de pago trae el límite y las instrucciones para pagar la seña', async () => {
      prisma.reserva.findMany.mockResolvedValueOnce([
        reserva({ estado: 'APROBADA_PENDIENTE_PAGO', limitePagoSena: new Date(ahora + H) }),
      ]);

      const [r] = await service.misReservas(7);

      expect(r.puedePagarSena).toBe(true);
      expect(r.limitePagoSena).toEqual(expect.any(Date));
      expect(r.instruccionesSena).toMatch(/Mercado Pago/);
    });

    it('TC-288 · sin reservas devuelve una lista vacía', async () => {
      await expect(service.misReservas(7)).resolves.toEqual([]);
    });
  });

  describe('formato en hora del club', () => {
    it('muestra fecha y hora argentinas', () => {
      expect(enHoraClub(new Date('2026-11-07T21:00:00Z'))).toBe('sáb 07/11/2026 18:00');
    });

    it('un turno por hora muestra el rango y uno de día completo, la fecha', () => {
      const turno = {
        inicio: new Date('2026-11-07T21:00:00Z'),
        fin: new Date('2026-11-07T23:00:00Z'),
      };
      expect(turnoLegible({ ...turno, espacio: { modalidad: 'POR_HORA' } })).toBe(
        'sáb 07/11/2026 18:00 a 20:00',
      );
      expect(
        turnoLegible({
          inicio: turno.inicio,
          fin: new Date('2026-11-08T03:00:00Z'),
          espacio: { modalidad: 'POR_HORA' },
        }),
      ).toBe('sáb 07/11/2026 18:00 a 24:00');
      expect(turnoLegible({ ...turno, espacio: { modalidad: 'DIA_COMPLETO' } })).toBe(
        'sáb 07/11/2026 (día completo)',
      );
    });
  });
});
