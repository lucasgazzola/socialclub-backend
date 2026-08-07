import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class CrearEventoDto {
  @ApiProperty({ example: 'Torneo de Verano' })
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @ApiPropertyOptional({ example: 'Torneo anual de fútbol' })
  @IsOptional()
  @IsString()
  descripcion?: string;

  @ApiProperty({ example: 100 })
  @IsInt()
  @Min(1)
  entradasDisponibles: number;
}