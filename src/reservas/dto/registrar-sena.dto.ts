import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

export const METODOS_PAGO_SENA = [
  'EFECTIVO',
  'TRANSFERENCIA',
  'DEBITO',
  'CREDITO',
  'OTRO',
] as const;

/** US-60: cobro de la seña registrado por secretaría. */
export class RegistrarSenaDto {
  @ApiProperty({ enum: METODOS_PAGO_SENA, example: 'EFECTIVO' })
  @IsIn(METODOS_PAGO_SENA, { message: 'El método de pago no es válido' })
  metodoPago: (typeof METODOS_PAGO_SENA)[number];
}
