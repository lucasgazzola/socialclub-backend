import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { TipoDocumentacionDisciplina } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * US-24 — Cargar documentación obligatoria de un participante.
 * Cada documento requiere tipo (del catálogo de documentación obligatoria),
 * fecha de vencimiento e integrante (Persona). La fecha de vencimiento es
 * OBLIGATORIA (no se puede guardar sin ella).
 */
export class CreateDocumentacionDto {
  @ApiProperty({
    enum: TipoDocumentacionDisciplina,
    description:
      'Tipo del catálogo. Debe estar exigido por alguna disciplina/categoría del participante.',
  })
  @IsEnum(TipoDocumentacionDisciplina, {
    message: 'El tipo de documento es obligatorio y debe pertenecer al catálogo.',
  })
  tipoDocumento: TipoDocumentacionDisciplina;

  @ApiPropertyOptional({
    example: 'Apto físico 2026',
    description: 'Descripción libre opcional. Si no se envía, se usa el nombre del tipo.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  tipo?: string;

  @ApiProperty({ example: '2026-12-31', description: 'Fecha de vencimiento (ISO 8601)' })
  @IsNotEmpty({ message: 'La fecha de vencimiento es obligatoria.' })
  @IsDateString({}, { message: 'La fecha de vencimiento debe ser una fecha válida.' })
  fechaVencimiento: string;

  @ApiProperty({ example: 1, description: 'ID del integrante (Persona) asociado' })
  @Type(() => Number) // en multipart el campo llega como string
  @IsInt()
  @IsNotEmpty({ message: 'Debe indicar el integrante asociado.' })
  personaId: number;
}
