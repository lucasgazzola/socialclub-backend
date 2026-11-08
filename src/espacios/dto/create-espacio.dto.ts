import {
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ModalidadReserva, TipoEspacio } from '@prisma/client';
import { CreateBloqueoDto } from './create-bloqueo.dto';

export class CreateEspacioDto {
  @ApiProperty({ description: 'Nombre del espacio', example: 'Cancha de fútbol 5' })
  @IsString({ message: 'El nombre debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El nombre del espacio es obligatorio' })
  nombre: string;

  @ApiProperty({ enum: TipoEspacio, example: TipoEspacio.DEPORTIVO })
  @IsEnum(TipoEspacio, { message: 'El tipo debe ser DEPORTIVO, SOCIAL o MULTIUSO' })
  tipo: TipoEspacio;

  @ApiProperty({ description: 'Capacidad máxima de personas', example: 20 })
  @IsInt({ message: 'La capacidad máxima debe ser un número entero' })
  @Min(1, { message: 'La capacidad máxima debe ser mayor a cero' })
  capacidadMaxima: number;

  @ApiProperty({ enum: ModalidadReserva, example: ModalidadReserva.POR_HORA })
  @IsEnum(ModalidadReserva, { message: 'La modalidad debe ser POR_HORA o DIA_COMPLETO' })
  modalidad: ModalidadReserva;

  @ApiPropertyOptional({ description: 'Ubicación o sector del espacio', example: 'Sector Polideportivo Norte' })
  @IsOptional()
  @IsString({ message: 'La ubicación debe ser una cadena de texto' })
  ubicacion?: string;

  @ApiPropertyOptional({ description: 'Descripción detallada del espacio' })
  @IsOptional()
  @IsString({ message: 'La descripción debe ser una cadena de texto' })
  descripcion?: string;

  @ApiProperty({ description: 'Precio de alquiler (por hora o por día)', example: 15000 })
  @IsNumber({}, { message: 'El precio debe ser un número válido' })
  @IsPositive({ message: 'El precio de alquiler debe ser mayor a cero' })
  precio: number;

  @ApiPropertyOptional({ description: 'Precio especial para socios al día', example: 10000 })
  @IsOptional()
  @IsNumber({}, { message: 'El precio de socio debe ser un número válido' })
  @IsPositive({ message: 'El precio para socios debe ser mayor a cero' })
  precioSocio?: number;

  @ApiProperty({ description: 'Monto de la seña requerida', example: 5000 })
  @IsNumber({}, { message: 'El monto de la seña debe ser un número válido' })
  @IsPositive({ message: 'El monto de la seña debe ser mayor a cero' })
  montoSena: number;

  @ApiPropertyOptional({
    description: 'IDs de las disciplinas compatibles (para tipo DEPORTIVO o MULTIUSO)',
    example: [1, 2],
  })
  @IsOptional()
  @IsArray({ message: 'disciplinaIds debe ser un arreglo de identificadores' })
  @IsInt({ each: true, message: 'Cada ID de disciplina debe ser un número entero' })
  disciplinaIds?: number[];

  @ApiPropertyOptional({
    description: 'Bloqueos de agenda iniciales (recurrentes o puntuales)',
    type: [CreateBloqueoDto],
  })
  @IsOptional()
  @IsArray({ message: 'bloqueos debe ser un arreglo de bloqueos de agenda' })
  @ValidateNested({ each: true })
  @Type(() => CreateBloqueoDto)
  bloqueos?: CreateBloqueoDto[];
}
