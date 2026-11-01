import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DiscoveryService, Reflector } from '@nestjs/core';
import type { OrdenPago } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { PasarelaService, SIN_COSTO } from './pasarela.service';
import { PasarelaSimulada } from './pasarelas/pasarela-simulada';
import { Acreditador, type AcreditadorCobro } from './acreditadores/acreditador-cobro';
import type { PasarelaPago } from './pasarelas/pasarela-pago';
import type { PagoInformado } from './pasarela.types';

/**
 * TASK-51 · Facade de cobros online: orden primero, acreditación
 * idempotente, revisión cuando se cobra sin poder acreditar y liberación del
 * cupo cuando no se paga. Pasarela y acreditadores simulados.
 */
describe('TASK-51 · PasarelaService', () => {
  const REF = '5f0c2c8e-7a51-4d0b-9f43-2a1b3c4d5e6f';
  const titular = { id: 7, roles: ['SOCIO'] };

  const orden = (extra: Partial<OrdenPago> = {}): OrdenPago => ({
    id: 1,
    referencia: REF,
    concepto: 'ENTRADAS',
    estado: 'PENDIENTE',
    pasarela: 'MERCADO_PAGO',
    usuarioId: 7,
    descripcion: '2 entrada(s) para "Peña"',
    monto: 3000 as never,
    datos: { eventoId: 1, cantidad: 2 },
    idCobroExterno: 'pref-1',
    urlPago: 'https://mp/checkout',
    idPagoExterno: null,
    detalleEstado: null,
    expiraEn: new Date(Date.now() + 60_000),
    resueltaEn: null,
    creadoEn: new Date(),
    actualizadoEn: new Date(),
    ...extra,
  });

  const pago = (extra: Partial<PagoInformado> = {}): PagoInformado => ({
    idPagoExterno: '999',
    referencia: REF,
    estado: 'APROBADO',
    monto: 3000,
    detalle: 'approved · accredited',
    ...extra,
  });

  let tx: any;
  let prisma: any;
  let auditoria: { registrar: jest.Mock };
  let pasarela: jest.Mocked<PasarelaPago>;
  let acreditador: { concepto: 'ENTRADAS'; acreditar: jest.Mock; liberar: jest.Mock };
  let service: PasarelaService;
  let config: Record<string, string | undefined>;

  @Acreditador()
  class AcreditadorDePrueba {}

  const crear = (pasarelaActiva: PasarelaPago = pasarela) => {
    const discovery = {
      getProviders: () => [{ metatype: AcreditadorDePrueba, instance: acreditador }],
    } as unknown as DiscoveryService;
    service = new PasarelaService(
      prisma as PrismaService,
      auditoria as unknown as AuditoriaService,
      { get: (k: string) => config[k] } as unknown as ConfigService,
      discovery,
      new Reflector(),
      pasarelaActiva,
    );
    service.onModuleInit();
  };

  beforeEach(() => {
    config = { APP_URL: 'https://socialclub.app' };
    tx = {
      ordenPago: {
        create: jest.fn((args: { data: Partial<OrdenPago> }) => Promise.resolve(orden(args.data))),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn(),
      },
    };
    prisma = {
      ordenPago: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn((args: { data: Partial<OrdenPago> }) => Promise.resolve(orden(args.data))),
      },
      usuario: { findUnique: jest.fn().mockResolvedValue({ nombre: 'Ana', apellido: 'Paz' }) },
      $transaction: jest.fn((cb: (t: unknown) => unknown) => cb(tx)),
    };
    auditoria = { registrar: jest.fn() };
    pasarela = {
      nombre: 'MERCADO_PAGO',
      crearCobro: jest
        .fn()
        .mockResolvedValue({ idCobroExterno: 'pref-1', urlPago: 'https://mp/checkout' }),
      consultarPago: jest.fn().mockResolvedValue(null),
      buscarPago: jest.fn().mockResolvedValue(null),
      leerNotificacion: jest.fn().mockReturnValue(null),
    };
    acreditador = {
      concepto: 'ENTRADAS',
      acreditar: jest.fn().mockResolvedValue(undefined),
      liberar: jest.fn().mockResolvedValue(undefined),
    };
    crear();
  });

  describe('registro de acreditadores', () => {
    it('descubre los providers marcados con @Acreditador()', () => {
      expect(() => service['acreditadorDe']('ENTRADAS')).not.toThrow();
      expect(() => service['acreditadorDe']('CUOTA_SOCIAL')).toThrow(/No hay acreditador/);
    });

    it('rechaza dos acreditadores para el mismo concepto', () => {
      const discovery = {
        getProviders: () => [
          { metatype: AcreditadorDePrueba, instance: acreditador },
          { metatype: AcreditadorDePrueba, instance: acreditador },
        ],
      } as unknown as DiscoveryService;
      const duplicado = new PasarelaService(
        prisma,
        auditoria as never,
        { get: () => undefined } as never,
        discovery,
        new Reflector(),
        pasarela,
      );
      expect(() => duplicado.onModuleInit()).toThrow(/dos acreditadores/);
    });
  });

  describe('iniciarCobro', () => {
    const solicitud = {
      concepto: 'ENTRADAS' as const,
      usuarioId: 7,
      descripcion: '2 entrada(s) para "Peña"',
      items: [{ titulo: 'Entrada — Peña', cantidad: 2, precioUnitario: 1500 }],
      datos: { eventoId: 1, cantidad: 2 },
    };

    it('reserva y crea la orden en una transacción, y después el cobro en la pasarela', async () => {
      const reservar = jest.fn();

      const resumen = await service.iniciarCobro({ ...solicitud, reservar });

      expect(reservar).toHaveBeenCalledWith(tx);
      expect(tx.ordenPago.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          concepto: 'ENTRADAS',
          pasarela: 'MERCADO_PAGO',
          monto: 3000,
        }),
      });
      expect(auditoria.registrar).toHaveBeenCalledWith(
        expect.objectContaining({ accion: 'CREAR', entidad: 'OrdenPago' }),
        tx,
      );
      expect(pasarela.crearCobro).toHaveBeenCalledWith(
        expect.objectContaining({
          urlRetorno: expect.stringMatching(
            /^https:\/\/socialclub\.app\/pagos\/resultado\?referencia=/,
          ),
          urlNotificacion: null,
          pagador: { nombre: 'Ana', apellido: 'Paz' },
        }),
      );
      expect(resumen).toEqual(
        expect.objectContaining({
          estado: 'PENDIENTE',
          urlPago: 'https://mp/checkout',
          monto: 3000,
        }),
      );
    });

    it('con API_PUBLIC_URL le pasa a la pasarela la URL del webhook', async () => {
      config.API_PUBLIC_URL = 'https://api.socialclub.app/';

      await service.iniciarCobro(solicitud);

      expect(pasarela.crearCobro.mock.calls[0][0].urlNotificacion).toBe(
        'https://api.socialclub.app/api/v1/pasarela/webhook',
      );
    });

    it('si la pasarela falla, cancela la orden, libera lo reservado y propaga el error', async () => {
      pasarela.crearCobro.mockRejectedValue(new Error('timeout'));
      tx.ordenPago.findUniqueOrThrow.mockResolvedValue(orden({ estado: 'CANCELADA' }));

      await expect(service.iniciarCobro(solicitud)).rejects.toThrow('timeout');

      expect(tx.ordenPago.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1, estado: 'PENDIENTE' },
          data: expect.objectContaining({ estado: 'CANCELADA' }),
        }),
      );
      expect(acreditador.liberar).toHaveBeenCalled();
    });

    it('si no hay nada que pagar (monto 0) acredita en el momento sin ir a la pasarela', async () => {
      tx.ordenPago.findUniqueOrThrow.mockResolvedValue(
        orden({ estado: 'APROBADA', pasarela: SIN_COSTO }),
      );

      const resumen = await service.iniciarCobro({
        ...solicitud,
        items: [{ titulo: 'Entrada — Peña', cantidad: 2, precioUnitario: 0 }],
      });

      expect(pasarela.crearCobro).not.toHaveBeenCalled();
      expect(tx.ordenPago.create.mock.calls[0][0].data.pasarela).toBe(SIN_COSTO);
      expect(acreditador.acreditar).toHaveBeenCalledWith(expect.anything(), tx, {
        reservaVigente: true,
      });
      expect(resumen.estado).toBe('APROBADA');
      expect(resumen.urlPago).toBeNull();
    });
  });

  describe('confirmar (vuelta del usuario)', () => {
    it('404 si la orden no existe', async () => {
      prisma.ordenPago.findUnique.mockResolvedValue(null);
      await expect(service.confirmar(REF, titular)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('TC-269 · 403 si la orden es de otro usuario (salvo ADMIN)', async () => {
      prisma.ordenPago.findUnique.mockResolvedValue(orden({ usuarioId: 99 }));
      await expect(service.confirmar(REF, titular)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.obtener(REF, { id: 1, roles: ['ADMIN'] })).resolves.toBeDefined();
    });

    it('TC-259 · con pago aprobado: marca APROBADA y acredita en la misma transacción', async () => {
      prisma.ordenPago.findUnique.mockResolvedValue(orden());
      pasarela.consultarPago.mockResolvedValue(pago());
      tx.ordenPago.findUniqueOrThrow.mockResolvedValue(orden({ estado: 'APROBADA' }));

      const resumen = await service.confirmar(REF, titular, '999');

      expect(tx.ordenPago.updateMany).toHaveBeenCalledWith({
        where: { id: 1, estado: 'PENDIENTE' },
        data: expect.objectContaining({ estado: 'APROBADA', idPagoExterno: '999' }),
      });
      expect(acreditador.acreditar).toHaveBeenCalledWith(expect.anything(), tx, {
        reservaVigente: true,
      });
      expect(auditoria.registrar).toHaveBeenCalledWith(
        expect.objectContaining({ accion: 'EDITAR', entidad: 'OrdenPago' }),
        tx,
      );
      expect(resumen.estado).toBe('APROBADA');
    });

    it('TC-267 · no acredita dos veces si otro proceso ya tomó la orden (webhook y vuelta a la vez)', async () => {
      prisma.ordenPago.findUnique.mockResolvedValue(orden());
      pasarela.consultarPago.mockResolvedValue(pago());
      tx.ordenPago.updateMany.mockResolvedValue({ count: 0 });
      tx.ordenPago.findUniqueOrThrow.mockResolvedValue(orden({ estado: 'APROBADA' }));

      const resumen = await service.confirmar(REF, titular, '999');

      expect(acreditador.acreditar).not.toHaveBeenCalled();
      expect(resumen.estado).toBe('APROBADA');
    });

    it('una orden ya aprobada no vuelve a consultar la pasarela', async () => {
      prisma.ordenPago.findUnique.mockResolvedValue(orden({ estado: 'APROBADA' }));

      await service.confirmar(REF, titular, '999');

      expect(pasarela.consultarPago).not.toHaveBeenCalled();
      expect(acreditador.acreditar).not.toHaveBeenCalled();
    });

    it('TC-270 · rechaza un id de pago que pertenece a otra orden', async () => {
      prisma.ordenPago.findUnique.mockResolvedValue(orden());
      pasarela.consultarPago.mockResolvedValue(pago({ referencia: 'otra' }));

      await expect(service.confirmar(REF, titular, '999')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(acreditador.acreditar).not.toHaveBeenCalled();
    });

    it('sin id de pago, lo busca por la referencia', async () => {
      prisma.ordenPago.findUnique.mockResolvedValue(orden());

      const resumen = await service.confirmar(REF, titular);

      expect(pasarela.buscarPago).toHaveBeenCalledWith(REF);
      expect(resumen.estado).toBe('PENDIENTE');
    });

    it('TC-260 · un pago rechazado deja la orden PENDIENTE (puede reintentar) con el motivo', async () => {
      prisma.ordenPago.findUnique.mockResolvedValue(orden());
      pasarela.consultarPago.mockResolvedValue(
        pago({ estado: 'RECHAZADO', detalle: 'rejected · cc_rejected_other_reason' }),
      );

      const resumen = await service.confirmar(REF, titular, '999');

      expect(prisma.ordenPago.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          idPagoExterno: '999',
          detalleEstado: 'Pago rechazado: rejected · cc_rejected_other_reason',
        },
      });
      expect(acreditador.acreditar).not.toHaveBeenCalled();
      expect(resumen.estado).toBe('PENDIENTE');
    });

    it('TC-262 · si se cobró pero no se puede acreditar, queda REQUIERE_REVISION y se audita', async () => {
      prisma.ordenPago.findUnique.mockResolvedValue(orden());
      pasarela.consultarPago.mockResolvedValue(pago());
      tx.ordenPago.findUniqueOrThrow.mockResolvedValue(orden({ estado: 'APROBADA' }));
      acreditador.acreditar.mockRejectedValue(
        new ConflictException('el período ya figuraba como pagado'),
      );

      const resumen = await service.confirmar(REF, titular, '999');

      expect(prisma.ordenPago.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: expect.objectContaining({
          estado: 'REQUIERE_REVISION',
          detalleEstado: 'Pago aprobado sin acreditar: el período ya figuraba como pagado',
        }),
      });
      expect(auditoria.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          detalle: expect.stringContaining('Requiere revisión y devolución'),
        }),
      );
      expect(resumen.estado).toBe('REQUIERE_REVISION');
    });

    it('un pago aprobado de una orden vencida se acredita volviendo a reservar', async () => {
      prisma.ordenPago.findUnique.mockResolvedValue(orden({ estado: 'VENCIDA' }));
      pasarela.consultarPago.mockResolvedValue(pago());
      tx.ordenPago.findUniqueOrThrow.mockResolvedValue(orden({ estado: 'APROBADA' }));

      await service.confirmar(REF, titular, '999');

      expect(tx.ordenPago.updateMany.mock.calls[0][0].where).toEqual({ id: 1, estado: 'VENCIDA' });
      expect(acreditador.acreditar).toHaveBeenCalledWith(expect.anything(), tx, {
        reservaVigente: false,
      });
    });
  });

  describe('procesarNotificacion (webhook)', () => {
    it('ignora lo que no es una notificación de pago', async () => {
      await service.procesarNotificacion({ headers: {}, query: {}, body: {} });
      expect(pasarela.consultarPago).not.toHaveBeenCalled();
    });

    it('consulta el pago informado y lo aplica a su orden', async () => {
      pasarela.leerNotificacion.mockReturnValue('999');
      pasarela.consultarPago.mockResolvedValue(pago());
      prisma.ordenPago.findUnique.mockResolvedValue(orden());
      tx.ordenPago.findUniqueOrThrow.mockResolvedValue(orden({ estado: 'APROBADA' }));

      await service.procesarNotificacion({ headers: {}, query: {}, body: {} });

      expect(prisma.ordenPago.findUnique).toHaveBeenCalledWith({ where: { referencia: REF } });
      expect(acreditador.acreditar).toHaveBeenCalled();
    });

    it('un pago de una orden que no existe no rompe el webhook', async () => {
      pasarela.leerNotificacion.mockReturnValue('999');
      pasarela.consultarPago.mockResolvedValue(pago());
      prisma.ordenPago.findUnique.mockResolvedValue(null);

      await expect(
        service.procesarNotificacion({ headers: {}, query: {}, body: {} }),
      ).resolves.toBeUndefined();
    });
  });

  describe('cancelar y vencer', () => {
    it('TC-264 · cancela una orden pendiente, libera el cupo y audita BAJA', async () => {
      prisma.ordenPago.findUnique.mockResolvedValue(orden());
      tx.ordenPago.findUniqueOrThrow.mockResolvedValue(orden({ estado: 'CANCELADA' }));

      const resumen = await service.cancelar(REF, titular);

      expect(acreditador.liberar).toHaveBeenCalled();
      expect(auditoria.registrar).toHaveBeenCalledWith(
        expect.objectContaining({ accion: 'BAJA' }),
        tx,
      );
      expect(resumen.estado).toBe('CANCELADA');
    });

    it('si al cancelar el pago ya estaba aprobado, lo acredita en vez de cancelar', async () => {
      prisma.ordenPago.findUnique.mockResolvedValue(orden());
      pasarela.buscarPago.mockResolvedValue(pago());
      tx.ordenPago.findUniqueOrThrow.mockResolvedValue(orden({ estado: 'APROBADA' }));

      const resumen = await service.cancelar(REF, titular);

      expect(acreditador.acreditar).toHaveBeenCalled();
      expect(acreditador.liberar).not.toHaveBeenCalled();
      expect(resumen.estado).toBe('APROBADA');
    });

    it('no cancela una orden que ya no está pendiente', async () => {
      prisma.ordenPago.findUnique.mockResolvedValue(orden({ estado: 'APROBADA' }));
      await expect(service.cancelar(REF, titular)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('cancelarPendientes cancela las órdenes pendientes del usuario para el concepto', async () => {
      prisma.ordenPago.findMany.mockResolvedValue([orden(), orden({ id: 2 })]);
      tx.ordenPago.findUniqueOrThrow.mockResolvedValue(orden({ estado: 'CANCELADA' }));

      await service.cancelarPendientes(7, 'ENTRADAS');

      expect(prisma.ordenPago.findMany).toHaveBeenCalledWith({
        where: { usuarioId: 7, concepto: 'ENTRADAS', estado: 'PENDIENTE' },
      });
      expect(acreditador.liberar).toHaveBeenCalledTimes(2);
    });

    it('TC-271 · vencerOrdenes vence las vencidas y acredita las que en realidad se pagaron', async () => {
      prisma.ordenPago.findMany.mockResolvedValue([
        orden({ id: 1 }),
        orden({ id: 2, referencia: 'pagada' }),
      ]);
      pasarela.buscarPago.mockImplementation((ref: string) =>
        Promise.resolve(ref === 'pagada' ? pago({ referencia: 'pagada' }) : null),
      );
      tx.ordenPago.findUniqueOrThrow
        .mockResolvedValueOnce(orden({ estado: 'VENCIDA' }))
        .mockResolvedValueOnce(orden({ id: 2, estado: 'APROBADA' }));

      const hoy = new Date();
      const resultado = await service.vencerOrdenes(hoy);

      expect(prisma.ordenPago.findMany).toHaveBeenCalledWith({
        where: { estado: 'PENDIENTE', expiraEn: { lt: hoy } },
      });
      expect(resultado).toEqual({ revisadas: 2, vencidas: 1, aprobadas: 1 });
    });
  });

  describe('simular (pasarela simulada)', () => {
    it('solo funciona con la pasarela simulada', async () => {
      await expect(service.simular(REF, titular, true)).rejects.toThrow(
        'El simulador solo está disponible con la pasarela simulada',
      );
    });

    it('aprueba el pago simulado y acredita por el mismo camino que un pago real', async () => {
      const simulada = new PasarelaSimulada({ get: () => undefined } as never);
      crear(simulada);
      prisma.ordenPago.findUnique.mockResolvedValue(orden({ pasarela: 'SIMULADA' }));
      tx.ordenPago.findUniqueOrThrow.mockResolvedValue(orden({ estado: 'APROBADA' }));

      const resumen = await service.simular(REF, titular, true);

      expect(acreditador.acreditar).toHaveBeenCalled();
      expect(resumen.estado).toBe('APROBADA');
    });

    it('no simula sobre una orden que ya no está pendiente', async () => {
      crear(new PasarelaSimulada({ get: () => undefined } as never));
      prisma.ordenPago.findUnique.mockResolvedValue(orden({ estado: 'CANCELADA' }));

      await expect(service.simular(REF, titular, true)).rejects.toThrow(
        'La orden de pago ya no está pendiente',
      );
    });
  });

  it('expone el nombre de la pasarela activa', () => {
    expect(service.nombrePasarela).toBe('MERCADO_PAGO');
  });

  // Tipado: el acreditador de prueba cumple la interfaz.
  it('el acreditador de prueba implementa AcreditadorCobro', () => {
    const a: AcreditadorCobro = acreditador;
    expect(a.concepto).toBe('ENTRADAS');
  });
});
