import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class SimularPagoDto {
  @ApiProperty({ description: 'true aprueba el pago simulado; false lo rechaza', example: true })
  @IsBoolean({ message: 'aprobado debe ser verdadero o falso' })
  aprobado: boolean;
}
