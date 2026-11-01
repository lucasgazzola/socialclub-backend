import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ConfirmarOrdenDto {
  @ApiPropertyOptional({
    description:
      'Id del pago que la pasarela agrega a la URL de vuelta (en Mercado Pago, `payment_id`). Si no viene, se busca por la referencia.',
    example: '1234567890',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  idPago?: string;
}
