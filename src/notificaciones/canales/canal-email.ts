import { Inject, Injectable } from '@nestjs/common';
import type { CanalNotificacion } from '@prisma/client';
import type { ContenidoEmail, Destinatario } from '../notificaciones.types';
import { PROVEEDOR_EMAIL, type ProveedorEmail } from '../proveedores/proveedor-email';
import type { Canal } from './canal';

/** Canal de email: delega la entrega en el proveedor configurado. */
@Injectable()
export class CanalEmail implements Canal {
  readonly tipo: CanalNotificacion = 'EMAIL';

  constructor(@Inject(PROVEEDOR_EMAIL) private readonly proveedor: ProveedorEmail) {}

  disponible(): boolean {
    return this.proveedor.configurado;
  }

  destinoDe(destinatario: Destinatario): string | null {
    return destinatario.email || null;
  }

  enviar(destino: string, contenido: unknown): Promise<void> {
    return this.proveedor.enviar(destino, contenido as ContenidoEmail);
  }
}
