import { PartialType } from '@nestjs/swagger';
import { CreateSocioDto } from './create-socio.dto';

/** US-13: edición de socio. Todos los campos son opcionales. */
export class UpdateSocioDto extends PartialType(CreateSocioDto) {}
