import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsIn, IsOptional, IsString, Matches } from 'class-validator';

export class RegistrarPagoSocioDto {
  @ApiProperty({
    description: 'Lista de períodos adeudados a registrar como pagados en formato YYYY-MM',
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
    enum: ['EFECTIVO', 'TRANSFERENCIA', 'DEBITO', 'CREDITO', 'OTRO', 'MOCK_TARJETA'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['EFECTIVO', 'TRANSFERENCIA', 'DEBITO', 'CREDITO', 'OTRO', 'MOCK_TARJETA'], {
    message: 'El método de pago no es válido',
  })
  metodoPago?: string;

  @ApiPropertyOptional({
    description: 'Observaciones o notas adicionales del cobro',
    example: 'Pago recibido en efectivo en ventanilla de secretaría',
  })
  @IsOptional()
  @IsString()
  observaciones?: string;
}
