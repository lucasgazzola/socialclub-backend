import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length } from 'class-validator';

export class CreateDisciplinaDto {
  @ApiProperty({ example: 'Fútbol' })
  @IsString()
  @Length(2, 60)
  nombre: string;

  @ApiPropertyOptional({ example: 'Deporte con pelota, equipos de 11' })
  @IsOptional()
  @IsString()
  descripcion?: string;
}
