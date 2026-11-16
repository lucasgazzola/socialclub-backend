import { OmitType } from '@nestjs/swagger';
import { CreateDocumentacionDto } from './create-documentacion.dto';

/**
 * TASK-60 — El titular sube su propio documento desde Mi club. Es la misma
 * carga que US-24 sin `personaId`: la persona sale del usuario autenticado.
 */
export class SubirMiDocumentacionDto extends OmitType(CreateDocumentacionDto, ['personaId']) {}
