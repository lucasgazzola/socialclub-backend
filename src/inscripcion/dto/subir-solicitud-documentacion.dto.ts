import { OmitType } from '@nestjs/swagger';
import { CreateDocumentacionDto } from '../../documentacion/dto/create-documentacion.dto';

export class SubirSolicitudDocumentacionDto extends OmitType(CreateDocumentacionDto, [
  'personaId',
]) {}
