import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Min,
  ValidateNested,
  ValidateIf,
} from 'class-validator';
import { GeneroDisciplina, TipoDocumentacionDisciplina } from '@prisma/client';
import { Type } from 'class-transformer';

export class RequerimientoDocumentacionDto {
  @ApiProperty({ enum: TipoDocumentacionDisciplina })
  @IsEnum(TipoDocumentacionDisciplina, {
    message: 'El tipo de documento no pertenece al catálogo de documentación obligatoria.',
  })
  tipoDocumento: TipoDocumentacionDisciplina;

  @ApiPropertyOptional({
    example: 30,
    default: 0,
    description: 'Días corridos de tolerancia. 0 significa obligatorio al inscribirse.',
  })
  @IsOptional()
  @IsInt({ message: 'El plazo de presentación debe ser un número entero de días.' })
  @Min(0, { message: 'El plazo de presentación no puede ser negativo.' })
  plazoDiasTolerancia?: number;
}

export class CreateDisciplinaDto {
  @ApiProperty({ example: 'Fútbol' })
  @IsString()
  @Length(2, 60)
  nombre: string;

  @ApiPropertyOptional({ example: 'Deporte con pelota, equipos de 11' })
  @IsOptional()
  @IsString()
  descripcion?: string;

  @ApiPropertyOptional({
    enum: GeneroDisciplina,
    example: GeneroDisciplina.NO_BINARIO_NO_ESPECIFICADO,
  })
  @IsOptional()
  @IsEnum(GeneroDisciplina)
  genero?: GeneroDisciplina;

  @ApiPropertyOptional({ example: 15, description: 'Edad mínima en años cumplidos' })
  @IsOptional()
  @IsInt()
  @Min(0)
  edadMinima?: number;

  @ApiPropertyOptional({ example: 17, description: 'Edad máxima en años cumplidos' })
  @IsOptional()
  @IsInt()
  @Min(0)
  edadMaxima?: number;

  @ApiPropertyOptional({ example: false, default: false })
  @IsOptional()
  @IsBoolean()
  solicitaDocumentacion?: boolean;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  activo?: boolean;

  @ApiPropertyOptional({
    type: [RequerimientoDocumentacionDto],
    example: [
      { tipoDocumento: 'DNI', plazoDiasTolerancia: 0 },
      { tipoDocumento: 'CERTIFICADO_MEDICO_APTITUD_FISICA', plazoDiasTolerancia: 30 },
    ],
    description:
      'Documentación requerida y plazo individual. Solo aplica si solicitaDocumentacion=true.',
  })
  @ValidateIf((o: CreateDisciplinaDto) => o.solicitaDocumentacion === true)
  @IsArray({ message: 'Seleccioná al menos un documento obligatorio.' })
  @ArrayMinSize(1, { message: 'Seleccioná al menos un documento obligatorio.' })
  @ValidateNested({ each: true })
  @Type(() => RequerimientoDocumentacionDto)
  requerimientosDocumentacion?: RequerimientoDocumentacionDto[];
}
