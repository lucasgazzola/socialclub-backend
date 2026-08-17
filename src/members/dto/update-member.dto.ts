import { PartialType } from '@nestjs/swagger';
import { CreateMemberDto } from './create-member.dto';

/** US-13: edición de socio. Todos los campos son opcionales. */
export class UpdateMemberDto extends PartialType(CreateMemberDto) {}
