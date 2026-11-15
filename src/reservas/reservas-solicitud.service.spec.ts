import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { ReservasPlantilla } from './reservas.plantilla';
import { ReservasService } from './reservas.service';

/**
 * US-59 — Solicitud de reserva de espacio: catálogo, disponibilidad,
 * presupuesto (tarifa socio al día vs regular + seña) y registro PENDIENTE_APROBACION.
 */
describe('US-59 · ReservasService (Solicitud de reserva)', () => {
  let prisma: any;
  let tx: any;
  let auditoria: { registrar: jest.Mock };
  let notificaciones: { notificar: jest.Mock };
  let pagos: { getCuotasPendientesPorSocio: jest.Mock };
  let pasarela: { iniciarCobro: jest.Mock };
  let service: ReservasService;

  const fechaFutura = (diasEnElFuturo = 7): string => {
    const d = new Date(Date.now() + diasEnElFuturo * 86_400_000);
    return d.toISOString().slice(0, 10);
  };

  const espacioPorHora = (extra: Record<string, unknown> = {}) => ({
    id: 1,
    nombre: 'Cancha Fútbol 5',
    tipo: 'CANCHA',
    capacidadMaxima: 10,
    modalidad: 'POR_HORA',
    ubicacion: 'Sector Norte',
    descripcion: 'Césped sintético',
    espacioPadreId: null,
    precio: 15000,
    descuentoSocio: 20,
    precioSocio: 12000,
    montoSena: 6000,
    activo: true,
    ...extra,
  });

  const espacioDiaCompleto = (extra: Record<string, unknown> = {}) => ({
    id: 2,
    nombre: 'Salón de Eventos',
    tipo: 'SALON',
    capacidadMaxima: 80,
    modalidad: 'DIA_COMPLETO',
    ubicacion: 'Edificio Central',
    descripcion: 'Con parrilla y cocina',
    espacioPadreId: null,
    precio: 100000,
    descuentoSocio: 30,
    precioSocio: null,
    montoSena: 30000,
    activo: true,
    ...extra,
  });

  beforeEach(() => {
    tx = {
      reserva: {
        create: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    prisma = {
      espacio: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(null),
      },
      reserva: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
      bloqueoAgenda: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      usuario: {
        findUnique: jest.fn().mockResolvedValue({
          persona: { id: 30, membresias: [{ id: 1 }] },
        }),
      },
      $transaction: jest.fn((cb: (t: unknown) => unknown) => cb(tx)),
    };
    auditoria = { registrar: jest.fn() };
    notificaciones = { notificar: jest.fn().mockResolvedValue({}) };
    pagos = {
      getCuotasPendientesPorSocio: jest
        .fn()
        .mockResolvedValue({ cuotasPendientes: [], totalAdeudado: 0 }),
    };
    pasarela = {
      iniciarCobro: jest.fn().mockResolvedValue({ referencia: 'ref', urlPago: 'https://pagar' }),
    };
    service = new ReservasService(
      prisma,
      auditoria as never,
      notificaciones as never,
      new ReservasPlantilla(),
      pagos as never,
      pasarela as never,
      { get: () => undefined } as unknown as ConfigService,
    );
  });

  describe('listarEspaciosDisponibles', () => {
    it('devuelve los espacios activos con tarifas numéricas y relaciones', async () => {
      prisma.espacio.findMany.mockResolvedValueOnce([
        {
          ...espacioPorHora(),
          espacioPadre: null,
          subespacios: [{ id: 11, nombre: 'Mitad A' }],
          disciplinas: [{ disciplina: { id: 3, nombre: 'Fútbol' } }],
        },
      ]);

      const resultado = await service.listarEspaciosDisponibles();

      expect(resultado).toHaveLength(1);
      expect(resultado[0]).toMatchObject({
        id: 1,
        nombre: 'Cancha Fútbol 5',
        precio: 15000,
        precioSocio: 12000,
        montoSena: 6000,
        subespacios: [{ id: 11, nombre: 'Mitad A' }],
        disciplinas: [{ id: 3, nombre: 'Fútbol' }],
      });
    });
  });

  describe('consultarDisponibilidad', () => {
    it('rechaza si el espacio no existe o está inactivo', async () => {
      prisma.espacio.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.consultarDisponibilidad({
          espacioId: 99,
          desde: '2026-11-20',
          hasta: '2026-11-25',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rechaza si hasta es anterior a desde o supera 62 días', async () => {
      prisma.espacio.findFirst.mockResolvedValue(espacioPorHora());

      await expect(
        service.consultarDisponibilidad({
          espacioId: 1,
          desde: '2026-11-25',
          hasta: '2026-11-20',
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.consultarDisponibilidad({
          espacioId: 1,
          desde: '2026-01-01',
          hasta: '2026-04-01',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('consolida bloqueos y reservas ocupantes del espacio y sus relacionados (Composite)', async () => {
      prisma.espacio.findFirst.mockResolvedValueOnce({ id: 10, modalidad: 'POR_HORA' });
      prisma.espacio.findUnique.mockResolvedValueOnce({
        espacioPadreId: 5,
        subespacios: [{ id: 11, activo: true }],
      });
      prisma.reserva.findMany.mockResolvedValueOnce([
        {
          id: 50,
          codigo: 'RES-AAA111',
          estado: 'CONFIRMADA',
          inicio: new Date('2026-11-20T21:00:00.000Z'), // 18:00 AR
          fin: new Date('2026-11-20T23:00:00.000Z'), // 20:00 AR
          espacioId: 5,
          espacio: { id: 5, nombre: 'Sector Completo' },
        },
      ]);
      prisma.bloqueoAgenda.findMany.mockResolvedValueOnce([
        {
          id: 7,
          tipo: 'PUNTUAL',
          diasSemana: [],
          fecha: new Date('2026-11-21T00:00:00.000Z'),
          horaInicio: '09:00',
          horaFin: '12:00',
          vigenteDesde: null,
          vigenteHasta: null,
          activo: true,
          motivo: 'Mantenimiento',
          espacioId: 10,
          espacio: { id: 10, nombre: 'Parrilla 1' },
        },
      ]);

      const res = await service.consultarDisponibilidad({
        espacioId: 10,
        desde: '2026-11-20',
        hasta: '2026-11-22',
      });

      expect(res.ocupados).toHaveLength(2);
      expect(res.ocupados[0]).toMatchObject({
        tipo: 'RESERVA',
        detalle: 'Reserva RES-AAA111 (Sector Completo)',
      });
      expect(res.ocupados[1]).toMatchObject({
        tipo: 'BLOQUEO',
        detalle: 'Mantenimiento',
      });
    });
  });

  describe('calcularPresupuesto', () => {
    it('aplica tarifa de socio cuando está activo y al día con la cuota social', async () => {
      prisma.espacio.findFirst.mockResolvedValueOnce(espacioPorHora());
      prisma.espacio.findUnique.mockResolvedValueOnce({ espacioPadreId: null, subespacios: [] });

      const p = await service.calcularPresupuesto(7, {
        espacioId: 1,
        fecha: fechaFutura(5),
        horaInicio: '18:00',
        horaFin: '20:00',
      });

      expect(p).toMatchObject({
        disponible: true,
        cantidad: 2,
        esSocio: true,
        alDia: true,
        aplicaTarifaSocio: true,
        montoRegular: 30000,
        descuentoAplicado: 6000,
        montoTotal: 24000,
        montoSena: 6000,
      });
    });

    it('cobra tarifa regular a un socio moroso (cuotas pendientes > 0)', async () => {
      prisma.espacio.findFirst.mockResolvedValueOnce(espacioPorHora());
      prisma.espacio.findUnique.mockResolvedValueOnce({ espacioPadreId: null, subespacios: [] });
      pagos.getCuotasPendientesPorSocio.mockResolvedValueOnce({
        cuotasPendientes: [{ id: 1 }],
        totalAdeudado: 10000,
      });

      const p = await service.calcularPresupuesto(7, {
        espacioId: 1,
        fecha: fechaFutura(5),
        horaInicio: '18:00',
        horaFin: '20:00',
      });

      expect(p).toMatchObject({
        esSocio: true,
        alDia: false,
        aplicaTarifaSocio: false,
        cuotasAdeudadas: 1,
        montoRegular: 30000,
        descuentoAplicado: 0,
        montoTotal: 30000,
        montoSena: 6000,
      });
    });

    it('cobra tarifa regular a un usuario no socio', async () => {
      prisma.espacio.findFirst.mockResolvedValueOnce(espacioPorHora());
      prisma.espacio.findUnique.mockResolvedValueOnce({ espacioPadreId: null, subespacios: [] });
      prisma.usuario.findUnique.mockResolvedValueOnce({ persona: null });

      const p = await service.calcularPresupuesto(9, {
        espacioId: 1,
        fecha: fechaFutura(5),
        horaInicio: '18:00',
        horaFin: '20:00',
      });

      expect(p.aplicaTarifaSocio).toBe(false);
      expect(p.montoTotal).toBe(30000);
    });

    it('calcula tarifa DIA_COMPLETO con porcentaje descuentoSocio cuando precioSocio es null y rechaza hoy/pasado', async () => {
      prisma.espacio.findFirst.mockResolvedValue(espacioDiaCompleto());
      prisma.espacio.findUnique.mockResolvedValue({ espacioPadreId: null, subespacios: [] });

      const hoy = fechaFutura(0);
      await expect(service.calcularPresupuesto(7, { espacioId: 2, fecha: hoy })).rejects.toThrow(
        BadRequestException,
      );

      const p = await service.calcularPresupuesto(7, {
        espacioId: 2,
        fecha: fechaFutura(3),
      });

      expect(p).toMatchObject({
        modalidad: 'DIA_COMPLETO',
        cantidad: 1,
        precioRegularUnitario: 100000,
        precioSocioUnitario: 70000,
        montoTotal: 70000,
        montoSena: 30000,
      });
    });

    it('rechaza rango horario inválido o turno pasado', async () => {
      prisma.espacio.findFirst.mockResolvedValue(espacioPorHora());

      await expect(
        service.calcularPresupuesto(7, {
          espacioId: 1,
          fecha: fechaFutura(3),
          horaInicio: '20:00',
          horaFin: '18:00',
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.calcularPresupuesto(7, {
          espacioId: 1,
          fecha: '2020-01-01',
          horaInicio: '18:00',
          horaFin: '20:00',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('solicitarReserva', () => {
    it('persiste la solicitud en PENDIENTE_APROBACION, genera código RES-XXXXXX y audita', async () => {
      const fecha = fechaFutura(5);
      prisma.espacio.findFirst.mockResolvedValueOnce(espacioPorHora());
      prisma.espacio.findUnique.mockResolvedValueOnce({ espacioPadreId: null, subespacios: [] });
      tx.reserva.create.mockImplementationOnce(({ data }: { data: Record<string, unknown> }) => ({
        id: 101,
        ...data,
        limitePagoSena: null,
        senaPagadaEn: null,
        metodoPagoSena: null,
        motivoRechazo: null,
        motivoCancelacion: null,
        creadoEn: new Date(),
        espacio: { id: 1, nombre: 'Cancha Fútbol 5', modalidad: 'POR_HORA' },
      }));

      const res = await service.solicitarReserva(7, {
        espacioId: 1,
        fecha,
        horaInicio: '18:00',
        horaFin: '20:00',
      });

      expect(res.reserva.codigo).toMatch(/^RES-[A-Z2-9]{6}$/);
      expect(res.reserva.estado).toBe('PENDIENTE_APROBACION');
      expect(res.reserva.montoTotal).toBe(24000);
      expect(res.reserva.montoSena).toBe(6000);
      expect(auditoria.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          accion: 'CREAR',
          entidad: 'Reserva',
          idEntidad: 101,
          responsableId: 7,
        }),
        tx,
      );
    });

    it('rechaza con ConflictException si hay un conflicto en tiempo real', async () => {
      const fecha = fechaFutura(5);
      const [a, m, d] = fecha.split('-').map(Number);
      prisma.espacio.findFirst.mockResolvedValueOnce(espacioPorHora());
      prisma.espacio.findUnique.mockResolvedValueOnce({ espacioPadreId: null, subespacios: [] });
      prisma.reserva.findMany.mockResolvedValueOnce([
        {
          id: 88,
          codigo: 'RES-OCUPAD',
          estado: 'CONFIRMADA',
          inicio: new Date(Date.UTC(a, m - 1, d, 21, 0)), // 18:00 AR
          fin: new Date(Date.UTC(a, m - 1, d, 23, 0)), // 20:00 AR
          espacioId: 1,
          espacio: { id: 1, nombre: 'Cancha Fútbol 5' },
        },
      ]);

      await expect(
        service.solicitarReserva(7, {
          espacioId: 1,
          fecha,
          horaInicio: '18:00',
          horaFin: '20:00',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('rechaza con ConflictException si el usuario ya tiene una solicitud pendiente superpuesta', async () => {
      const fecha = fechaFutura(5);
      prisma.espacio.findFirst.mockResolvedValueOnce(espacioPorHora());
      prisma.espacio.findUnique.mockResolvedValueOnce({ espacioPadreId: null, subespacios: [] });
      prisma.reserva.findFirst.mockResolvedValueOnce({ codigo: 'RES-PEND01' });

      await expect(
        service.solicitarReserva(7, {
          espacioId: 1,
          fecha,
          horaInicio: '18:00',
          horaFin: '20:00',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });
});
