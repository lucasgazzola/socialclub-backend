import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { EstadoEvento } from '@prisma/client';

function transformOptionalDate({ value }: { value: unknown }) {
  if (value === '' || value === null || value === undefined) {
    return null;
  }
  const d = new Date(value as string | number | Date);
  return isNaN(d.getTime()) ? value : d;
}

export class CrearEventoDto {
  @ApiProperty({ example: 'Torneo de Verano' })
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @ApiPropertyOptional({ example: 'Torneo anual de fútbol' })
  @IsOptional()
  @IsString()
  descripcion?: string;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  requiereEntrada?: boolean;

  @ApiPropertyOptional({ example: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  capacidadMaxima?: number | null;

  @ApiPropertyOptional({ example: 100 })
  @IsOptional()
  @IsInt()
  @Min(0)
  entradasDisponibles?: number | null;

  @ApiPropertyOptional({ example: 5000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  precio?: number;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  descuentoSocio?: number;

  @ApiPropertyOptional({ enum: EstadoEvento, default: EstadoEvento.PUBLICADO })
  @IsOptional()
  @IsEnum(EstadoEvento)
  estado?: EstadoEvento;

  @ApiProperty({ example: '2027-01-15T00:00:00Z' })
  @Type(() => Date)
  @IsDate()
  fechaEvento: Date;

  @ApiPropertyOptional({ example: '2027-01-16T00:00:00Z' })
  @Transform(transformOptionalDate)
  @IsOptional()
  @IsDate()
  fechaFin?: Date | null;

  @ApiPropertyOptional({ example: 'url-imagen' })
  @IsOptional()
  @IsString()
  imagen?: string;

  @ApiProperty({ example: 'Club Social y Deportivo' })
  @IsString()
  @IsNotEmpty()
  lugarAcreditacion: string;

  @ApiPropertyOptional({ example: '2026-10-01T00:00:00Z' })
  @Transform(transformOptionalDate)
  @IsOptional()
  @IsDate()
  inicioVenta?: Date | null;

  @ApiPropertyOptional({ example: '2026-12-01T00:00:00Z' })
  @Transform(transformOptionalDate)
  @IsOptional()
  @IsDate()
  finVenta?: Date | null;
}
