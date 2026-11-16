import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DiscoveryModule } from '@nestjs/core';
import { PasarelaService } from './pasarela.service';
import { PasarelaController } from './pasarela.controller';
import { WebhookController } from './webhook.controller';
import { VencerOrdenesPagoTarea } from './vencer-ordenes-pago.tarea';
import { PASARELA_PAGO, type PasarelaPago } from './pasarelas/pasarela-pago';
import { PasarelaMercadoPago } from './pasarelas/pasarela-mercado-pago';
import { PasarelaSimulada } from './pasarelas/pasarela-simulada';

/**
 * Elige la pasarela activa: `PASARELA_PAGOS` si está definida; si no, Mercado
 * Pago cuando hay `MP_ACCESS_TOKEN` y la simulada cuando no.
 */
export function elegirPasarela(
  config: ConfigService,
  mercadoPago: PasarelaMercadoPago,
  simulada: PasarelaSimulada,
): PasarelaPago {
  const elegida =
    config.get<string>('PASARELA_PAGOS') ??
    (config.get<string>('MP_ACCESS_TOKEN') ? 'mercadopago' : 'simulada');
  if (elegida === 'mercadopago') return mercadoPago;
  new Logger('PasarelaModule').warn(
    'Pasarela de pagos SIMULADA: los pagos se aprueban desde el simulador, no se cobra nada.',
  );
  return simulada;
}

/**
 * Cobros online (TASK-51, decisión 0003). Solo exporta la facade. Los
 * dominios aportan sus acreditadores con `@Acreditador()`; este módulo no
 * importa ninguno. Para sumar una pasarela: implementar `PasarelaPago`,
 * agregarla a `providers` y a `elegirPasarela`.
 */
@Module({
  imports: [DiscoveryModule],
  controllers: [PasarelaController, WebhookController],
  providers: [
    PasarelaMercadoPago,
    PasarelaSimulada,
    {
      provide: PASARELA_PAGO,
      useFactory: elegirPasarela,
      inject: [ConfigService, PasarelaMercadoPago, PasarelaSimulada],
    },
    PasarelaService,
    VencerOrdenesPagoTarea,
  ],
  exports: [PasarelaService],
})
export class PasarelaModule {}
