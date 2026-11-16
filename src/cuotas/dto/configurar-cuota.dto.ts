import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNumber, IsOptional, Matches, Max, Min } from 'class-validator';

export class ConfigurarCuotaDto {
  @ApiProperty({ example: 1, description: 'ID de la disciplina' })
  @IsInt()
  disciplinaId: number;

  @ApiPropertyOptional({
    example: 7,
    description:
      'Categoría de la disciplina. Si se omite, es la tarifa base de la disciplina; si se indica, reemplaza a la base para esa categoría.',
  })
  @IsOptional()
  @IsInt()
  categoriaDisciplinaId?: number;

  @ApiProperty({ example: 15000, description: 'Monto mensual de la cuota (mayor a cero)' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(99_999_999.99)
  monto: number;

  @ApiPropertyOptional({
    example: '2026-09',
    description:
      'Período de aplicación "YYYY-MM" desde el que rige el monto. Si se omite, aplica al período siguiente.',
  })
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: 'periodoAplicacion debe tener el formato YYYY-MM (ej: 2026-09)',
  })
  periodoAplicacion?: string;

  @ApiPropertyOptional({
    example: 20,
    default: 0,
    description: 'Descuento para socios, en porcentaje (0 a 100).',
  })
  @IsOptional()
  @IsInt({ message: 'El descuento para socios debe ser un número entero.' })
  @Min(0, { message: 'El descuento para socios no puede ser negativo.' })
  @Max(100, { message: 'El descuento para socios no puede superar el 100 %.' })
  descuentoSocioPorcentaje?: number;
}
