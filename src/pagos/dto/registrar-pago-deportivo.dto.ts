import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';

/**
 * US-21 — Registrar el pago de una o varias cuotas deportivas (de una misma
 * disciplina) para un participante, en una sola operación.
 */
export class RegistrarPagoDeportivoDto {
  @ApiProperty({
    description: 'Disciplina cuya cuota deportiva se está cobrando',
    example: 3,
  })
  @Type(() => Number)
  @IsInt({ message: 'La disciplina indicada no es válida' })
  @Min(1, { message: 'La disciplina indicada no es válida' })
  disciplinaId: number;

  @ApiProperty({
    description: 'Períodos a registrar como pagados en formato YYYY-MM',
    example: ['2026-08', '2026-09'],
  })
  @IsArray({ message: 'El campo periodos debe ser una lista de períodos' })
  @ArrayNotEmpty({ message: 'Debe seleccionar al menos un período para abonar' })
  @IsString({ each: true, message: 'Cada período debe ser una cadena de texto' })
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    each: true,
    message: 'Cada período debe tener el formato YYYY-MM (ej: 2026-08)',
  })
  periodos: string[];

  @ApiPropertyOptional({
    description: 'Método de pago o cobro utilizado en secretaría',
    example: 'EFECTIVO',
    enum: ['EFECTIVO', 'TRANSFERENCIA', 'DEBITO', 'CREDITO', 'OTRO'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['EFECTIVO', 'TRANSFERENCIA', 'DEBITO', 'CREDITO', 'OTRO'], {
    message: 'El método de pago no es válido',
  })
  metodoPago?: string;

  @ApiPropertyOptional({
    description: 'Observaciones o notas adicionales del cobro',
    example: 'Pago recibido en efectivo en ventanilla',
  })
  @IsOptional()
  @IsString()
  observaciones?: string;
}
