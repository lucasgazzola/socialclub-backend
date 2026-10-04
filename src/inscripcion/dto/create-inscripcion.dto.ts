import { GeneroDisciplina, TipoDocumentacionDisciplina } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  IsEmail,
  IsDateString,
  Matches,
  IsArray,
  ValidateNested,
  MaxLength,
} from 'class-validator';

/**
 * Documentación opcional que se adjunta durante la misma operación de alta (US-05, Criterio 7).
 */
export class CreateInscripcionDocumentoDto {
  @IsEnum(TipoDocumentacionDisciplina, {
    message: 'El tipo de documento es obligatorio y debe pertenecer al catálogo.',
  })
  tipoDocumento: TipoDocumentacionDisciplina;

  @IsNotEmpty({ message: 'La fecha de vencimiento es obligatoria.' })
  @IsDateString({}, { message: 'La fecha de vencimiento debe ser una fecha válida.' })
  fechaVencimiento: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  tipo?: string;

  @IsOptional()
  @IsString()
  archivoNombre?: string;

  @IsOptional()
  @IsString()
  archivoRuta?: string;

  @IsOptional()
  @IsString()
  mimeType?: string;

  @IsOptional()
  @IsInt()
  tamano?: number;
}

/**
 * Alta de inscripción. Se usa en dos modos:
 *  - Participante ya registrado: se envía solo `personaId` + disciplina/categoría.
 *  - Participante nuevo: se envían sus datos básicos (nombre, apellido, dni, etc.).
 * Por eso los datos de persona son opcionales: se requieren solo cuando no viene personaId.
 * Además, permite adjuntar los documentos faltantes en la misma operación de alta (US-05).
 */
export class CreateInscripcionDto {
  @IsOptional()
  @IsInt()
  personaId?: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  nombre?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'El apellido es obligatorio' })
  apellido?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'El DNI es obligatorio' })
  @Matches(/^\d{7,8}$/, { message: 'El DNI debe tener entre 7 y 8 dígitos numéricos' })
  dni?: string;

  @IsOptional()
  @IsDateString({}, { message: 'La fecha de nacimiento debe tener formato ISO (YYYY-MM-DD)' })
  fechaNacimiento?: string;

  @IsOptional()
  @IsEnum(GeneroDisciplina, { message: 'El género seleccionado no es válido' })
  genero?: GeneroDisciplina;

  @IsOptional()
  @IsEmail({}, { message: 'El email no tiene un formato válido' })
  email?: string;

  @IsOptional()
  @IsString()
  telefono?: string;

  @IsInt({ message: 'Debe indicar la disciplina' })
  disciplinaId: number;

  @IsOptional()
  @IsInt()
  categoriaDisciplinaId?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateInscripcionDocumentoDto)
  documentos?: CreateInscripcionDocumentoDto[];
}

