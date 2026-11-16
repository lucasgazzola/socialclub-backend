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
  ArrayMinSize,
  ValidateNested,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { requiereVencimiento } from '../../disciplinas/requerimientos-doc';
import { ConfirmaEmail } from '../../common/decorators/confirma-email.decorator';

/**
 * Documentación opcional que se adjunta durante la misma operación de alta (US-05, Criterio 7).
 */
export class CreateInscripcionDocumentoDto {
  @IsEnum(TipoDocumentacionDisciplina, {
    message: 'El tipo de documento es obligatorio y debe pertenecer al catálogo.',
  })
  tipoDocumento: TipoDocumentacionDisciplina;

  @ValidateIf(
    (o: CreateInscripcionDocumentoDto) =>
      !o.tipoDocumento ||
      requiereVencimiento(o.tipoDocumento) ||
      (o.fechaVencimiento !== undefined && o.fechaVencimiento !== ''),
  )
  @IsNotEmpty({ message: 'La fecha de vencimiento es obligatoria.' })
  @IsDateString({}, { message: 'La fecha de vencimiento debe ser una fecha válida.' })
  fechaVencimiento?: string;

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

export class CreateInscripcionDisciplinaDto {
  @ValidateIf((o: CreateInscripcionDto) => !o.disciplinas?.length)
  @IsInt({ message: 'Debe indicar la disciplina' })
  disciplinaId?: number;

  @IsOptional()
  @IsInt()
  categoriaDisciplinaId?: number;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: 'Debe seleccionar al menos una disciplina' })
  @ValidateNested({ each: true })
  @Type(() => CreateInscripcionDisciplinaDto)
  disciplinas?: CreateInscripcionDisciplinaDto[];
}

/**
 * Alta de inscripción. Se usa en dos modos:
 *  - Participante ya registrado: se envía solo `personaId` + disciplina/categoría(s).
 *  - Participante nuevo: se envían sus datos básicos (nombre, apellido, dni, etc.).
 * Por eso los datos de persona son opcionales: se requieren solo cuando no viene personaId.
 * Soporta una disciplina (`disciplinaId`) o múltiples (`disciplinas`).
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

  /**
   * DT-54: el email escrito por segunda vez. Obligatorio al cargar un
   * participante nuevo con email (no cuando se inscribe a uno ya registrado).
   */
  @ValidateIf((o: CreateInscripcionDto) => !!o.email && !o.personaId)
  @IsNotEmpty({ message: 'Confirmá el email.' })
  @ConfirmaEmail('email')
  confirmarEmail?: string;

  @IsOptional()
  @IsString()
  telefono?: string;

  @ValidateIf((o: CreateInscripcionDto) => !o.disciplinas?.length)
  @IsInt({ message: 'Debe indicar la disciplina' })
  disciplinaId?: number;

  @IsOptional()
  @IsInt()
  categoriaDisciplinaId?: number;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: 'Debe seleccionar al menos una disciplina' })
  @ValidateNested({ each: true })
  @Type(() => CreateInscripcionDisciplinaDto)
  disciplinas?: CreateInscripcionDisciplinaDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateInscripcionDocumentoDto)
  documentos?: CreateInscripcionDocumentoDto[];
}
