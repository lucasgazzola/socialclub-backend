import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DiscoveryService, Reflector } from '@nestjs/core';
import type { ConceptoCobro, OrdenPago } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { ACREDITADOR_COBRO, type AcreditadorCobro } from './acreditadores/acreditador-cobro';
import { PASARELA_PAGO, type PasarelaPago } from './pasarelas/pasarela-pago';
import { PasarelaSimulada } from './pasarelas/pasarela-simulada';
import type {
  NotificacionEntrante,
  OrdenPagoResumen,
  PagoInformado,
  SolicitudOrden,
} from './pasarela.types';

/** Cuánto vive una orden sin pagar (también vence la preferencia en la pasarela). */
export const MINUTOS_VIGENCIA_ORDEN = 30;

/** Pasarela que se anota en las órdenes que no requieren pago (monto 0). */
export const SIN_COSTO = 'SIN_COSTO';

/** Usuario que consulta u opera una orden. */
export interface UsuarioOrden {
  id: number;
  roles: string[];
}

/**
 * Facade de cobros online (TASK-51, decisión 0003). Los módulos de dominio
 * solo conocen `iniciarCobro`; el resto lo usan el controller, el webhook y
 * la tarea de vencimiento.
 *
 * - **Orden primero:** la orden se guarda antes de ir a la pasarela, con todo
 *   lo necesario para acreditar.
 * - **Acreditación idempotente:** la orden pasa de PENDIENTE a APROBADA con un
 *   `updateMany` condicionado al estado anterior, en la misma transacción que
 *   el acreditador: si llegan a la vez el webhook y la vuelta del usuario,
 *   solo uno acredita.
 * - **La pasarela se consulta siempre:** ni la URL de vuelta ni el webhook se
 *   toman como prueba de pago; se pregunta el estado a la pasarela.
 */
@Injectable()
export class PasarelaService implements OnModuleInit {
  private readonly logger = new Logger(PasarelaService.name);
  private readonly acreditadores = new Map<ConceptoCobro, AcreditadorCobro>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
    private readonly config: ConfigService,
    private readonly discovery: DiscoveryService,
    private readonly reflector: Reflector,
    @Inject(PASARELA_PAGO) private readonly pasarela: PasarelaPago,
  ) {}

  onModuleInit() {
    for (const { metatype, instance } of this.discovery.getProviders()) {
      if (!metatype || !instance || !this.reflector.get(ACREDITADOR_COBRO, metatype)) continue;
      const acreditador = instance as AcreditadorCobro;
      if (this.acreditadores.has(acreditador.concepto)) {
        throw new Error(`Hay dos acreditadores para el concepto «${acreditador.concepto}»`);
      }
      this.acreditadores.set(acreditador.concepto, acreditador);
    }
    this.logger.log(
      `Pasarela de pagos: ${this.pasarela.nombre} · conceptos: ${[...this.acreditadores.keys()].join(', ') || '—'}`,
    );
  }

  /** Nombre de la pasarela activa (MERCADO_PAGO o SIMULADA). */
  get nombrePasarela(): string {
    return this.pasarela.nombre;
  }

  private acreditadorDe(concepto: ConceptoCobro): AcreditadorCobro {
    const acreditador = this.acreditadores.get(concepto);
    if (!acreditador) throw new Error(`No hay acreditador para el concepto «${concepto}»`);
    return acreditador;
  }

  // ── Iniciar ───────────────────────────────────────────────────────────────

  /**
   * Crea la orden (reservando lo que haga falta) y el cobro en la pasarela.
   * Si no hay nada que pagar (monto 0), acredita en el momento.
   */
  async iniciarCobro(solicitud: SolicitudOrden): Promise<OrdenPagoResumen> {
    this.acreditadorDe(solicitud.concepto);
    const monto =
      Math.round(solicitud.items.reduce((t, i) => t + i.cantidad * i.precioUnitario, 0) * 100) /
      100;
    const sinCosto = monto === 0;
    const expiraEn = new Date(Date.now() + MINUTOS_VIGENCIA_ORDEN * 60_000);

    const orden = await this.prisma.$transaction(async (tx) => {
      await solicitud.reservar?.(tx);
      const creada = await tx.ordenPago.create({
        data: {
          concepto: solicitud.concepto,
          pasarela: sinCosto ? SIN_COSTO : this.pasarela.nombre,
          usuarioId: solicitud.usuarioId,
          descripcion: solicitud.descripcion,
          monto,
          datos: solicitud.datos,
          expiraEn,
        },
      });
      await this.auditoria.registrar(
        {
          accion: 'CREAR',
          entidad: 'OrdenPago',
          idEntidad: creada.id,
          responsableId: solicitud.usuarioId,
          detalle: `Orden de pago ${creada.referencia} iniciada con ${creada.pasarela}: ${solicitud.descripcion} por $${monto.toFixed(2)}`,
        },
        tx,
      );
      return creada;
    });

    if (sinCosto) {
      return this.resumen(
        await this.aplicarPago(orden, {
          idPagoExterno: SIN_COSTO,
          referencia: orden.referencia,
          estado: 'APROBADO',
          monto: 0,
          detalle: 'Sin costo',
        }),
      );
    }

    try {
      const usuario = await this.prisma.usuario.findUnique({
        where: { id: solicitud.usuarioId },
        select: { nombre: true, apellido: true },
      });
      const cobro = await this.pasarela.crearCobro({
        referencia: orden.referencia,
        descripcion: solicitud.descripcion,
        items: solicitud.items,
        pagador: { nombre: usuario?.nombre ?? '', apellido: usuario?.apellido ?? '' },
        urlRetorno: this.urlRetorno(orden.referencia),
        urlNotificacion: this.urlNotificacion(),
        expiraEn,
      });
      return this.resumen(
        await this.prisma.ordenPago.update({
          where: { id: orden.id },
          data: { idCobroExterno: cobro.idCobroExterno, urlPago: cobro.urlPago },
        }),
      );
    } catch (error) {
      // Sin cobro no hay orden: se libera lo reservado.
      await this.cerrarSinPago(
        orden,
        'CANCELADA',
        `No se pudo crear el cobro: ${(error as Error).message}`,
      );
      throw error;
    }
  }

  private urlRetorno(referencia: string): string {
    const front = this.config.get<string>('APP_URL') ?? 'http://localhost:5173';
    return `${front}/pagos/resultado?referencia=${encodeURIComponent(referencia)}`;
  }

  /** Solo si la API es accesible desde internet (en local, no). */
  private urlNotificacion(): string | null {
    const api = this.config.get<string>('API_PUBLIC_URL');
    return api ? `${api.replace(/\/$/, '')}/api/v1/pasarela/webhook` : null;
  }

  // ── Consultar y confirmar ─────────────────────────────────────────────────

  private async ordenDe(referencia: string, usuario?: UsuarioOrden): Promise<OrdenPago> {
    const orden = await this.prisma.ordenPago.findUnique({ where: { referencia } });
    if (!orden) throw new NotFoundException('Orden de pago no encontrada');
    if (usuario && orden.usuarioId !== usuario.id && !usuario.roles.includes('ADMIN')) {
      throw new ForbiddenException('La orden de pago pertenece a otro usuario');
    }
    return orden;
  }

  async obtener(referencia: string, usuario: UsuarioOrden): Promise<OrdenPagoResumen> {
    return this.resumen(await this.ordenDe(referencia, usuario));
  }

  /**
   * Vuelta del usuario desde la pasarela: consulta el pago (por el id que
   * trae la URL o buscándolo por la referencia) y lo aplica.
   */
  async confirmar(
    referencia: string,
    usuario: UsuarioOrden,
    idPagoExterno?: string,
  ): Promise<OrdenPagoResumen> {
    const orden = await this.ordenDe(referencia, usuario);
    if (orden.estado === 'APROBADA' || orden.estado === 'REQUIERE_REVISION') {
      return this.resumen(orden);
    }
    let pago = idPagoExterno ? await this.pasarela.consultarPago(idPagoExterno) : null;
    if (pago && pago.referencia !== referencia) {
      throw new BadRequestException('El pago informado no corresponde a esta orden');
    }
    pago ??= await this.pasarela.buscarPago(referencia);
    return this.resumen(await this.aplicarPago(orden, pago));
  }

  /** Webhook: la pasarela avisa que cambió un pago. */
  async procesarNotificacion(notificacion: NotificacionEntrante): Promise<void> {
    const idPago = this.pasarela.leerNotificacion(notificacion);
    if (!idPago) return;
    const pago = await this.pasarela.consultarPago(idPago);
    if (!pago?.referencia) return;
    const orden = await this.prisma.ordenPago.findUnique({
      where: { referencia: pago.referencia },
    });
    if (!orden) {
      this.logger.warn(`Pago ${idPago} de una orden inexistente (${pago.referencia})`);
      return;
    }
    await this.aplicarPago(orden, pago);
  }

  /** Simulador del front: solo con la pasarela simulada. */
  async simular(
    referencia: string,
    usuario: UsuarioOrden,
    aprobado: boolean,
  ): Promise<OrdenPagoResumen> {
    if (!(this.pasarela instanceof PasarelaSimulada)) {
      throw new BadRequestException('El simulador solo está disponible con la pasarela simulada');
    }
    const orden = await this.ordenDe(referencia, usuario);
    if (orden.estado !== 'PENDIENTE') {
      throw new BadRequestException('La orden de pago ya no está pendiente');
    }
    const pago = this.pasarela.simular(referencia, Number(orden.monto), aprobado);
    return this.resumen(await this.aplicarPago(orden, pago));
  }

  /**
   * Aplica lo que informó la pasarela. Solo un pago APROBADO cambia el estado:
   * un rechazo deja la orden PENDIENTE (en Checkout Pro el usuario puede
   * reintentar con otra tarjeta) y queda anotado en `detalleEstado`.
   */
  private async aplicarPago(orden: OrdenPago, pago: PagoInformado | null): Promise<OrdenPago> {
    if (!pago) return orden;

    if (pago.estado !== 'APROBADO') {
      if (orden.estado !== 'PENDIENTE') return orden;
      const prefijo = pago.estado === 'RECHAZADO' ? 'Pago rechazado' : 'Pago en proceso';
      return this.prisma.ordenPago.update({
        where: { id: orden.id },
        data: { idPagoExterno: pago.idPagoExterno, detalleEstado: `${prefijo}: ${pago.detalle}` },
      });
    }

    if (orden.estado === 'APROBADA' || orden.estado === 'REQUIERE_REVISION') return orden;

    const acreditador = this.acreditadorDe(orden.concepto);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const tomada = await tx.ordenPago.updateMany({
          where: { id: orden.id, estado: orden.estado },
          data: {
            estado: 'APROBADA',
            idPagoExterno: pago.idPagoExterno,
            detalleEstado: pago.detalle,
            resueltaEn: new Date(),
          },
        });
        const actual = await tx.ordenPago.findUniqueOrThrow({ where: { id: orden.id } });
        // Otro proceso la acreditó primero (webhook y vuelta a la vez).
        if (tomada.count === 0) return actual;
        await acreditador.acreditar(actual, tx, { reservaVigente: orden.estado === 'PENDIENTE' });
        await this.auditoria.registrar(
          {
            accion: 'EDITAR',
            entidad: 'OrdenPago',
            idEntidad: orden.id,
            responsableId: orden.usuarioId,
            detalle: `Orden de pago ${orden.referencia} aprobada y acreditada (pago ${pago.idPagoExterno} en ${orden.pasarela})`,
          },
          tx,
        );
        return actual;
      });
    } catch (error) {
      // Se cobró pero no se pudo acreditar (p. ej. el período ya lo cobró
      // secretaría o se agotó el cupo después de vencer): hay que revisarla.
      const motivo = (error as Error).message;
      this.logger.error(`Orden ${orden.referencia} cobrada sin acreditar: ${motivo}`);
      const revision = await this.prisma.ordenPago.update({
        where: { id: orden.id },
        data: {
          estado: 'REQUIERE_REVISION',
          idPagoExterno: pago.idPagoExterno,
          detalleEstado: `Pago aprobado sin acreditar: ${motivo}`,
          resueltaEn: new Date(),
        },
      });
      await this.auditoria.registrar({
        accion: 'EDITAR',
        entidad: 'OrdenPago',
        idEntidad: orden.id,
        responsableId: orden.usuarioId,
        detalle: `Orden de pago ${orden.referencia} cobrada (pago ${pago.idPagoExterno}) pero no acreditada: ${motivo}. Requiere revisión y devolución.`,
      });
      return revision;
    }
  }

  // ── Cancelar y vencer ─────────────────────────────────────────────────────

  /**
   * El usuario desiste. Antes se pregunta a la pasarela: si el pago ya se
   * aprobó (y el aviso no llegó), se acredita en vez de cancelar.
   */
  async cancelar(referencia: string, usuario: UsuarioOrden): Promise<OrdenPagoResumen> {
    const orden = await this.ordenDe(referencia, usuario);
    if (orden.estado !== 'PENDIENTE') {
      throw new BadRequestException('Solo se puede cancelar una orden de pago pendiente');
    }
    return this.resumen(
      await this.cancelarSiNoSePago(orden, 'CANCELADA', 'Cancelada por el usuario'),
    );
  }

  /** Cancela las órdenes pendientes de un usuario para un concepto (antes de iniciar otra). */
  async cancelarPendientes(usuarioId: number, concepto: ConceptoCobro): Promise<void> {
    const pendientes = await this.prisma.ordenPago.findMany({
      where: { usuarioId, concepto, estado: 'PENDIENTE' },
    });
    for (const orden of pendientes) {
      await this.cancelarSiNoSePago(orden, 'CANCELADA', 'Reemplazada por una nueva orden');
    }
  }

  /** Tarea automática: vence las órdenes pendientes que pasaron su plazo. */
  async vencerOrdenes(hoy = new Date()) {
    const vencidas = await this.prisma.ordenPago.findMany({
      where: { estado: 'PENDIENTE', expiraEn: { lt: hoy } },
    });
    let aprobadas = 0;
    for (const orden of vencidas) {
      const resultado = await this.cancelarSiNoSePago(orden, 'VENCIDA', 'Venció sin pago');
      if (resultado.estado !== 'VENCIDA') aprobadas++;
    }
    return { revisadas: vencidas.length, vencidas: vencidas.length - aprobadas, aprobadas };
  }

  private async cancelarSiNoSePago(
    orden: OrdenPago,
    estado: 'CANCELADA' | 'VENCIDA',
    motivo: string,
  ): Promise<OrdenPago> {
    if (orden.pasarela !== SIN_COSTO) {
      const pago = await this.pasarela.buscarPago(orden.referencia);
      if (pago?.estado === 'APROBADO') return this.aplicarPago(orden, pago);
    }
    return this.cerrarSinPago(orden, estado, motivo);
  }

  private async cerrarSinPago(
    orden: OrdenPago,
    estado: 'CANCELADA' | 'VENCIDA',
    motivo: string,
  ): Promise<OrdenPago> {
    const acreditador = this.acreditadorDe(orden.concepto);
    return this.prisma.$transaction(async (tx) => {
      const tomada = await tx.ordenPago.updateMany({
        where: { id: orden.id, estado: 'PENDIENTE' },
        data: { estado, detalleEstado: motivo, resueltaEn: new Date() },
      });
      const actual = await tx.ordenPago.findUniqueOrThrow({ where: { id: orden.id } });
      if (tomada.count === 0) return actual;
      await acreditador.liberar?.(actual, tx);
      await this.auditoria.registrar(
        {
          accion: 'BAJA',
          entidad: 'OrdenPago',
          idEntidad: orden.id,
          responsableId: orden.usuarioId,
          detalle: `Orden de pago ${orden.referencia} ${estado === 'VENCIDA' ? 'vencida' : 'cancelada'}: ${motivo}`,
        },
        tx,
      );
      return actual;
    });
  }

  private resumen(orden: OrdenPago): OrdenPagoResumen {
    return {
      referencia: orden.referencia,
      concepto: orden.concepto,
      estado: orden.estado,
      pasarela: orden.pasarela,
      descripcion: orden.descripcion,
      monto: Number(orden.monto),
      urlPago: orden.estado === 'PENDIENTE' ? orden.urlPago : null,
      detalleEstado: orden.detalleEstado,
      expiraEn: orden.expiraEn,
      creadoEn: orden.creadoEn,
    };
  }
}
