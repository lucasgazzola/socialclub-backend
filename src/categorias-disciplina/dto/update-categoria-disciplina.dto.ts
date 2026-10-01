import { PartialType } from '@nestjs/swagger';
import { CreateCategoriaDisciplinaDto } from './create-categoria-disciplina.dto';

/** US-49 — Editar categoría (nombre y/o documentación adicional). */
export class UpdateCategoriaDisciplinaDto extends PartialType(CreateCategoriaDisciplinaDto) {}
