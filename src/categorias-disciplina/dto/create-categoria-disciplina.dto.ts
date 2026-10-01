import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { GeneroDisciplina } from '@prisma/client';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { RequerimientoDocumentacionDto } from '../../disciplinas/dto/create-disciplina.dto';

/**
 * US-48 — Agregar categoría a una disciplina.
 * La categoría puede exigir documentación ADICIONAL a la de su disciplina y
 * afinar sus restricciones de género y edad (null = hereda de la disciplina).
 * La edad es la que se cumple en el año calendario (por año de nacimiento).
 */
export class CreateCategoriaDisciplinaDto {
  @ApiProperty({ example: 'Sub-15' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 60, { message: 'El nombre de la categoría debe tener entre 1 y 60 caracteres.' })
  nombre: string;

  @ApiPropertyOptional({
    enum: GeneroDisciplina,
    nullable: true,
    description: 'Restricción de género. Null = hereda la de la disciplina.',
  })
  @IsOptional()
  @IsEnum(GeneroDisciplina, { message: 'El género seleccionado no es válido.' })
  genero?: GeneroDisciplina | null;

  @ApiPropertyOptional({
    example: 13,
    nullable: true,
    description: 'Edad mínima que se cumple en el año calendario. Null = hereda.',
  })
  @IsOptional()
  @IsInt({ message: 'La edad mínima debe ser un número entero.' })
  @Min(0, { message: 'La edad mínima no puede ser negativa.' })
  @Max(120, { message: 'La edad mínima no es válida.' })
  edadMinima?: number | null;

  @ApiPropertyOptional({
    example: 15,
    nullable: true,
    description: 'Edad máxima que se cumple en el año calendario. Null = hereda.',
  })
  @IsOptional()
  @IsInt({ message: 'La edad máxima debe ser un número entero.' })
  @Min(0, { message: 'La edad máxima no puede ser negativa.' })
  @Max(120, { message: 'La edad máxima no es válida.' })
  edadMaxima?: number | null;

  @ApiPropertyOptional({
    type: [RequerimientoDocumentacionDto],
    example: [{ tipoDocumento: 'AUTORIZACION_PADRES_TUTORES', plazoDiasTolerancia: 15 }],
    description:
      'Documentación obligatoria adicional a la de la disciplina. No puede repetir tipos que ya exige la disciplina.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RequerimientoDocumentacionDto)
  requerimientosDocumentacion?: RequerimientoDocumentacionDto[];
}
