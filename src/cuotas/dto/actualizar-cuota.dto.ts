import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';

export class ActualizarCuotaDto {
  @ApiPropertyOptional({ example: 18000, description: 'Nuevo monto mensual (mayor a cero)' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(99_999_999.99)
  monto?: number;

  @ApiPropertyOptional({
    example: 20,
    description: 'Descuento para socios, en porcentaje (0 a 100).',
  })
  @IsOptional()
  @IsInt({ message: 'El descuento para socios debe ser un número entero.' })
  @Min(0, { message: 'El descuento para socios no puede ser negativo.' })
  @Max(100, { message: 'El descuento para socios no puede superar el 100 %.' })
  descuentoSocioPorcentaje?: number;

  @ApiPropertyOptional({ description: 'Desactivar/reactivar la configuración' })
  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
