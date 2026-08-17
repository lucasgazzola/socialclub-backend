import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNumber, IsOptional, Matches, Max, Min } from 'class-validator';

export class ConfigureFeeDto {
  @ApiProperty({ example: 1, description: 'ID de la disciplina' })
  @IsInt()
  disciplineId: number;

  @ApiProperty({ example: 1, description: 'ID de la categoría de socio' })
  @IsInt()
  categoryId: number;

  @ApiProperty({ example: 15000, description: 'Monto mensual de la cuota (mayor a cero)' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(99_999_999.99)
  amount: number;

  @ApiPropertyOptional({
    example: '2026-09',
    description:
      'Período de aplicación "YYYY-MM" desde el que rige el monto. Si se omite, aplica al período siguiente.',
  })
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: 'appliedPeriod debe tener el formato YYYY-MM (ej: 2026-09)',
  })
  appliedPeriod?: string;
}
