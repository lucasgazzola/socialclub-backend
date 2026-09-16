import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class ValidarEntradaDto {
  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'Token UUID único de la entrada, extraído del código QR.',
  })
  @IsString()
  @IsNotEmpty()
  @IsUUID('4')
  token: string;
}
