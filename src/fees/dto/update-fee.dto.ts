import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional, Max, Min } from 'class-validator';

export class UpdateFeeDto {
  @ApiPropertyOptional({ example: 18000, description: 'Nuevo monto mensual (mayor a cero)' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(99_999_999.99)
  amount?: number;

  @ApiPropertyOptional({ description: 'Desactivar/reactivar la configuración' })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
