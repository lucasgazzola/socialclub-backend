import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

/** TASK-60 — Motivo con el que se rechaza un documento que subió el titular. */
export class RechazarDocumentacionDto {
  @ApiProperty({ example: 'La foto está borrosa: no se lee la fecha de vencimiento.' })
  @IsString({ message: 'Indicá el motivo del rechazo.' })
  @MinLength(5, { message: 'El motivo del rechazo debe tener al menos 5 caracteres.' })
  @MaxLength(300, { message: 'El motivo del rechazo no puede superar los 300 caracteres.' })
  motivo: string;
}
