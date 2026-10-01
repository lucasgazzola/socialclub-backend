import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

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

  @ApiProperty({ example: 100 })
  @IsInt()
  @Min(1)
  capacidadMaxima: number;

  @ApiProperty({ example: '2027-01-01T00:00:00Z' })
  @Type(() => Date)
  @IsDate()
  cierreInscripcion: Date;

  @ApiProperty({ example: '2027-01-15T00:00:00Z' })
  @Type(() => Date)
  @IsDate()
  fechaEvento: Date;

  @ApiPropertyOptional({ example: 'url-imagen' })
  @IsOptional()
  @IsString()
  imagen?: string;

  @ApiProperty({ example: 'Club Social y Deportivo' })
  @IsString()
  @IsNotEmpty()
  lugarAcreditacion: string;

  @ApiPropertyOptional({ example: 5000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  precio?: number;
}
