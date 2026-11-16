import { PartialType } from '@nestjs/swagger';
import { CrearEventoDto } from './crear-evento.dto';

export class ActualizarEventoDto extends PartialType(CrearEventoDto) {}
