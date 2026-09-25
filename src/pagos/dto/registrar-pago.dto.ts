import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsOptional, IsString, Matches } from 'class-validator';

export class RegistrarPagoDto {
  @ApiProperty({
    description: 'Lista de períodos a abonar en formato YYYY-MM',
    example: ['2026-08', '2026-09'],
  })
  @IsArray()
  @ArrayNotEmpty({ message: 'Debe seleccionar al menos un período para abonar' })
  @IsString({ each: true })
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    each: true,
    message: 'Cada período debe tener el formato YYYY-MM',
  })
  periodos: string[];

  @ApiPropertyOptional({ description: 'Método de pago utilizado', example: 'MOCK_TARJETA' })
  @IsOptional()
  @IsString()
  metodoPago?: string;

  @ApiPropertyOptional({ description: 'Número de tarjeta (Mock visual)' })
  @IsOptional()
  @IsString()
  numeroTarjeta?: string;

  @ApiPropertyOptional({ description: 'Fecha de vencimiento (Mock visual)' })
  @IsOptional()
  @IsString()
  vencimiento?: string;

  @ApiPropertyOptional({ description: 'Código CVC (Mock visual)' })
  @IsOptional()
  @IsString()
  cvc?: string;

  @ApiPropertyOptional({ description: 'Titular de la tarjeta (Mock visual)' })
  @IsOptional()
  @IsString()
  titular?: string;
}
