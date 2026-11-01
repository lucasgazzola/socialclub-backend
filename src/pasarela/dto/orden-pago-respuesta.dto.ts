import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ConceptoCobro, EstadoOrdenPago } from '@prisma/client';
import type { OrdenPagoResumen } from '../pasarela.types';

export class OrdenPagoRespuestaDto implements OrdenPagoResumen {
  @ApiProperty({ example: '5f0c2c8e-7a51-4d0b-9f43-2a1b3c4d5e6f' })
  referencia: string;

  @ApiProperty({ enum: ConceptoCobro })
  concepto: ConceptoCobro;

  @ApiProperty({ enum: EstadoOrdenPago })
  estado: EstadoOrdenPago;

  @ApiProperty({ example: 'MERCADO_PAGO', description: 'MERCADO_PAGO, SIMULADA o SIN_COSTO' })
  pasarela: string;

  @ApiProperty({ example: 'Cuota social 2026-09, 2026-10' })
  descripcion: string;

  @ApiProperty({ example: 24000 })
  monto: number;

  @ApiPropertyOptional({
    nullable: true,
    description: 'A dónde redirigir al usuario para pagar; null si la orden ya no está pendiente',
  })
  urlPago: string | null;

  @ApiPropertyOptional({
    nullable: true,
    example: 'Pago rechazado: rejected · cc_rejected_other_reason',
  })
  detalleEstado: string | null;

  @ApiProperty()
  expiraEn: Date;

  @ApiProperty()
  creadoEn: Date;
}
