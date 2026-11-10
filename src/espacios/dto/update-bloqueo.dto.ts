import { PartialType } from '@nestjs/swagger';
import { CreateBloqueoDto } from './create-bloqueo.dto';

export class UpdateBloqueoDto extends PartialType(CreateBloqueoDto) {}
