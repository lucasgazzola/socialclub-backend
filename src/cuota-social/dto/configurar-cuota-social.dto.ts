import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNumber, IsOptional, Matches, Max, Min } from 'class-validator';

export class ConfigurarCuotaSocialDto {
  @ApiProperty({ example: 1, description: 'ID de la categoría de socio (Juvenil/General/Senior)' })
  @IsInt()
  categoriaId: number;

  @ApiProperty({ example: 15000, description: 'Monto mensual de la cuota social (mayor a cero)' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(99_999_999.99)
  monto: number;

  @ApiPropertyOptional({
    example: '2026-10',
    description:
      'Período de aplicación "YYYY-MM" desde el que rige el monto. Si se omite, aplica al período siguiente.',
  })
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: 'periodoAplicacion debe tener el formato YYYY-MM (ej: 2026-10)',
  })
  periodoAplicacion?: string;
}
