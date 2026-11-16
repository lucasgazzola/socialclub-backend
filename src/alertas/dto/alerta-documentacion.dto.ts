import { ApiProperty } from '@nestjs/swagger';
import { TipoDocumentacionDisciplina } from '@prisma/client';

/** DT-26 — Una alerta de documentación (US-26) en Swagger. */
export class AlertaDocumentacionDto {
  @ApiProperty({
    example: '5:CERTIFICADO_MEDICO_APTITUD_FISICA:POR_VENCER:2026-10-08',
    description: 'Identifica el aviso para no repetirlo por email',
  })
  clave: string;

  @ApiProperty({
    enum: ['POR_VENCER', 'VENCIDO', 'PRESENTACION_POR_VENCER', 'PRESENTACION_VENCIDA'],
  })
  tipo: string;

  @ApiProperty({ example: 5 })
  inscripcionId: number;

  @ApiProperty({ example: 10 })
  personaId: number;

  @ApiProperty({ example: 'Gómez, Lola' })
  participante: string;

  @ApiProperty({ example: 1 })
  disciplinaId: number;

  @ApiProperty({ example: 'Fútbol' })
  disciplina: string;

  @ApiProperty({ nullable: true, example: 'Sub-15' })
  categoria: string | null;

  @ApiProperty({ enum: TipoDocumentacionDisciplina })
  tipoDocumento: TipoDocumentacionDisciplina;

  @ApiProperty({ example: 'Certificado médico de aptitud física' })
  documento: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'Vencimiento del documento o fecha límite para presentarlo',
  })
  fecha: Date;

  @ApiProperty({ example: 4, description: 'Negativo si la fecha ya pasó' })
  diasRestantes: number;

  @ApiProperty({ example: 'Vence en 4 días (08/10/2026)' })
  mensaje: string;
}
