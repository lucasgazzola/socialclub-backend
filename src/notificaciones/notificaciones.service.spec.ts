import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import type { CanalNotificacion } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { CANALES, type Canal } from './canales/canal';
import { NotificacionesService, HORAS_REINTENTO, MAX_INTENTOS } from './notificaciones.service';
import type { Plantilla } from './notificaciones.types';

/**
 * DT-36 · NotificacionesService (facade): registra cada notificación antes de
 * enviarla (outbox), elige los canales que la plantilla soporta y reintenta
 * lo pendiente o fallido.
 */
describe('DT-36 · NotificacionesService', () => {
  let service: NotificacionesService;

  const txMock = { notificacion: { createManyAndReturn: jest.fn() } };
  const prismaMock = {
    usuario: { findMany: jest.fn() },
    notificacion: { findMany: jest.fn(), update: jest.fn() },
    $transaction: jest.fn((fn: (tx: typeof txMock) => unknown) => fn(txMock)),
  };
  const auditoriaMock = { registrar: jest.fn() };
  const canalEmail = {
    tipo: 'EMAIL' as CanalNotificacion,
    disponible: jest.fn(),
    destinoDe: jest.fn((d: { email: string }) => d.email || null),
    enviar: jest.fn(),
  } satisfies Canal;

  const plantilla: Plantilla<{ n: number }> = {
    tipo: 'ALERTAS_DOCUMENTACION',
    contenidoPara: (canal, datos, contexto) =>
      canal === 'EMAIL' ? { asunto: `n=${datos.n}`, html: contexto.appUrl ?? '', texto: '' } : null,
  };

  const fila = (id: number, extra: Record<string, unknown> = {}) => ({
    id,
    canal: 'EMAIL',
    destino: `u${id}@club.test`,
    contenido: { asunto: 'x' },
    ...extra,
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    canalEmail.disponible.mockReturnValue(true);
    canalEmail.enviar.mockResolvedValue(undefined);
    prismaMock.usuario.findMany.mockResolvedValue([
      { id: 1, email: 'u1@club.test' },
      { id: 2, email: 'u2@club.test' },
    ]);
    txMock.notificacion.createManyAndReturn.mockImplementation(
      ({ data }: { data: { destino: string }[] }) => data.map((d, i) => fila(i + 1, d)),
    );

    const modulo = await Test.createTestingModule({
      providers: [
        NotificacionesService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuditoriaService, useValue: auditoriaMock },
        { provide: ConfigService, useValue: new ConfigService({ APP_URL: 'https://club.test' }) },
        { provide: CANALES, useValue: [canalEmail] },
      ],
    }).compile();
    service = modulo.get(NotificacionesService);
  });

  describe('notificar', () => {
    it('registra una notificación por destinatario y canal, y la envía', async () => {
      const r = await service.notificar({
        plantilla,
        datos: { n: 3 },
        destinatarios: [1, 2],
        referencias: ['a', 'b'],
      });

      expect(r).toEqual({ creadas: 2, enviadas: 2, fallidas: 0, pendientes: 0 });
      expect(prismaMock.usuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: { in: [1, 2] }, activo: true } }),
      );
      expect(txMock.notificacion.createManyAndReturn).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            tipo: 'ALERTAS_DOCUMENTACION',
            canal: 'EMAIL',
            usuarioId: 1,
            destino: 'u1@club.test',
            contenido: { asunto: 'n=3', html: 'https://club.test', texto: '' },
            referencias: ['a', 'b'],
          }),
          expect.objectContaining({ usuarioId: 2, destino: 'u2@club.test' }),
        ],
      });
      expect(canalEmail.enviar).toHaveBeenCalledWith('u1@club.test', expect.anything());
      expect(prismaMock.notificacion.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: expect.objectContaining({ estado: 'ENVIADA', intentos: { increment: 1 } }),
      });
      expect(auditoriaMock.registrar).toHaveBeenCalledWith(
        expect.objectContaining({ accion: 'CREAR', entidad: 'Notificacion' }),
        txMock,
      );
    });

    it('si el envío falla la deja FALLIDA con el error, y sigue con las demás', async () => {
      canalEmail.enviar.mockRejectedValueOnce(new Error('SMTP caído'));

      const r = await service.notificar({ plantilla, datos: { n: 1 }, destinatarios: [1, 2] });

      expect(r).toMatchObject({ creadas: 2, enviadas: 1, fallidas: 1 });
      expect(prismaMock.notificacion.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { estado: 'FALLIDA', intentos: { increment: 1 }, ultimoError: 'SMTP caído' },
      });
    });

    it('con el canal sin configurar la registra igual y la deja pendiente', async () => {
      canalEmail.disponible.mockReturnValue(false);

      const r = await service.notificar({ plantilla, datos: { n: 1 }, destinatarios: [1] });

      expect(r).toMatchObject({ creadas: 2, enviadas: 0, pendientes: 2 });
      expect(canalEmail.enviar).not.toHaveBeenCalled();
      expect(prismaMock.notificacion.update).not.toHaveBeenCalled();
    });

    it('no crea nada para los canales que la plantilla no soporta', async () => {
      const sinEmail: Plantilla<object> = {
        tipo: 'ALERTAS_DOCUMENTACION',
        contenidoPara: () => null,
      };

      const r = await service.notificar({ plantilla: sinEmail, datos: {}, destinatarios: [1] });

      expect(r.creadas).toBe(0);
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('sin destinatarios no consulta nada', async () => {
      const r = await service.notificar({ plantilla, datos: { n: 1 }, destinatarios: [] });
      expect(r.creadas).toBe(0);
      expect(prismaMock.usuario.findMany).not.toHaveBeenCalled();
    });
  });

  describe('filtrarNuevas', () => {
    it('devuelve solo las claves que ninguna notificación del tipo referencia', async () => {
      prismaMock.notificacion.findMany.mockResolvedValue([{ referencias: ['a', 'x'] }]);

      await expect(service.filtrarNuevas('ALERTAS_DOCUMENTACION', ['a', 'b'])).resolves.toEqual([
        'b',
      ]);
      expect(prismaMock.notificacion.findMany).toHaveBeenCalledWith({
        where: { tipo: 'ALERTAS_DOCUMENTACION', referencias: { hasSome: ['a', 'b'] } },
        select: { referencias: true },
      });
    });

    it('sin claves no consulta', async () => {
      await expect(service.filtrarNuevas('ALERTAS_DOCUMENTACION', [])).resolves.toEqual([]);
      expect(prismaMock.notificacion.findMany).not.toHaveBeenCalled();
    });
  });

  it('usuariosConRol devuelve los ids de los usuarios activos con ese rol', async () => {
    prismaMock.usuario.findMany.mockResolvedValue([{ id: 4 }, { id: 9 }]);

    await expect(service.usuariosConRol('DELEGADO')).resolves.toEqual([4, 9]);
    expect(prismaMock.usuario.findMany).toHaveBeenCalledWith({
      where: { activo: true, roles: { some: { rol: { nombre: 'DELEGADO' } } } },
      select: { id: true },
    });
  });

  it('despacharPendientes reintenta lo pendiente o fallido reciente y con intentos disponibles', async () => {
    const ahora = new Date('2026-10-03T12:00:00.000Z');
    prismaMock.notificacion.findMany.mockResolvedValue([fila(7), fila(8)]);

    const r = await service.despacharPendientes(ahora);

    expect(r).toEqual({ revisadas: 2, enviadas: 2, fallidas: 0, pendientes: 0 });
    expect(prismaMock.notificacion.findMany).toHaveBeenCalledWith({
      where: {
        estado: { in: ['PENDIENTE', 'FALLIDA'] },
        intentos: { lt: MAX_INTENTOS },
        creadaEn: { gte: new Date(ahora.getTime() - HORAS_REINTENTO * 3600 * 1000) },
      },
      orderBy: { creadaEn: 'asc' },
    });
  });
});
