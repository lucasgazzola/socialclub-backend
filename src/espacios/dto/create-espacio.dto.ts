import {
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ModalidadReserva, TipoEspacio } from '@prisma/client';
import { CreateBloqueoDto } from './create-bloqueo.dto';

export class CreateSubespacioDto {
  @ApiProperty({ description: 'Nombre de la unidad o sub-espacio', example: 'Parrilla 1' })
  @IsString({ message: 'El nombre del sub-espacio debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El nombre del sub-espacio es obligatorio' })
  nombre: string;

  @ApiPropertyOptional({
    description: 'Capacidad máxima de la unidad (por defecto hereda del padre)',
    example: 10,
  })
  @IsOptional()
  @IsInt({ message: 'La capacidad máxima del sub-espacio debe ser un número entero' })
  @Min(1, { message: 'La capacidad máxima del sub-espacio debe ser mayor a cero' })
  capacidadMaxima?: number;

  @ApiPropertyOptional({ description: 'Descripción particular de la unidad' })
  @IsOptional()
  @IsString({ message: 'La descripción del sub-espacio debe ser una cadena de texto' })
  descripcion?: string;

  @ApiPropertyOptional({ description: 'Precio particular (por defecto hereda del padre)' })
  @IsOptional()
  @IsNumber({}, { message: 'El precio del sub-espacio debe ser un número válido' })
  @IsPositive({ message: 'El precio del sub-espacio debe ser mayor a cero' })
  precio?: number;

  @ApiPropertyOptional({
    description: 'Precio para socios particular (por defecto hereda del padre)',
  })
  @IsOptional()
  @IsNumber({}, { message: 'El precio de socio del sub-espacio debe ser un número válido' })
  @IsPositive({ message: 'El precio para socios del sub-espacio debe ser mayor a cero' })
  precioSocio?: number;

  @ApiPropertyOptional({
    description: 'Porcentaje de descuento para socios (0 a 100%)',
    example: 20,
  })
  @IsOptional()
  @IsInt({ message: 'El descuento para socios debe ser un número entero' })
  @Min(0, { message: 'El descuento no puede ser negativo' })
  @Max(100, { message: 'El descuento no puede superar el 100%' })
  descuentoSocio?: number;

  @ApiPropertyOptional({
    description: 'Monto de seña particular (por defecto hereda del padre)',
  })
  @IsOptional()
  @IsNumber({}, { message: 'El monto de la seña del sub-espacio debe ser un número válido' })
  @IsPositive({ message: 'El monto de la seña del sub-espacio debe ser mayor a cero' })
  montoSena?: number;
}

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

  @ApiPropertyOptional({
    description: 'Ubicación o sector del espacio',
    example: 'Sector Polideportivo Norte',
  })
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

  @ApiPropertyOptional({
    description: 'Porcentaje de descuento para socios activos (0 a 100%)',
    example: 20,
  })
  @IsOptional()
  @IsInt({ message: 'El descuento para socios debe ser un número entero' })
  @Min(0, { message: 'El descuento no puede ser negativo' })
  @Max(100, { message: 'El descuento no puede ser mayor al 100%' })
  descuentoSocio?: number;

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
    description: 'ID del espacio contenedor padre (Patrón Composite)',
    example: 1,
  })
  @IsOptional()
  @IsInt({ message: 'espacioPadreId debe ser un número entero' })
  @Min(1, { message: 'espacioPadreId debe ser mayor a cero' })
  espacioPadreId?: number;

  @ApiPropertyOptional({
    description:
      'Cantidad de sub-espacios iguales a generar automáticamente en lote (ej. 9 parrillas o 3 canchas)',
    example: 9,
  })
  @IsOptional()
  @IsInt({ message: 'cantidadSubespacios debe ser un número entero' })
  @Min(1, { message: 'cantidadSubespacios debe ser al menos 1' })
  @Max(50, { message: 'No se pueden generar más de 50 sub-espacios en un solo lote' })
  cantidadSubespacios?: number;

  @ApiPropertyOptional({
    description:
      'Prefijo para nombrar los sub-espacios generados en lote (ej. "Parrilla" -> "Parrilla 1")',
    example: 'Parrilla',
  })
  @IsOptional()
  @IsString({ message: 'prefijoSubespacio debe ser una cadena de texto' })
  prefijoSubespacio?: string;

  @ApiPropertyOptional({
    description: 'Capacidad máxima individual de cada sub-espacio generado en lote',
    example: 10,
  })
  @IsOptional()
  @IsInt({ message: 'capacidadSubespacio debe ser un número entero' })
  @Min(1, { message: 'capacidadSubespacio debe ser mayor a cero' })
  capacidadSubespacio?: number;

  @ApiPropertyOptional({
    description: 'Lista explícita de sub-espacios hijos personalizados (Patrón Composite)',
    type: [CreateSubespacioDto],
  })
  @IsOptional()
  @IsArray({ message: 'subespacios debe ser un arreglo de sub-espacios' })
  @ValidateNested({ each: true })
  @Type(() => CreateSubespacioDto)
  subespacios?: CreateSubespacioDto[];

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
