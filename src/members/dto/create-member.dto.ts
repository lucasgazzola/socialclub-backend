import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEmail, IsInt, IsOptional, IsString, Length } from 'class-validator';

export class CreateMemberDto {
  @ApiProperty({ example: 'Lucas' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'Gazzola' })
  @IsString()
  lastName: string;

  @ApiProperty({ example: '40123456' })
  @IsString()
  @Length(6, 20)
  dni: string;

  @ApiPropertyOptional({ example: '2000-05-12' })
  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @ApiPropertyOptional({ example: 'socio@correo.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: '+54 353 1234567' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 1, description: 'ID de CategoriaSocio' })
  @IsOptional()
  @IsInt()
  categoryId?: number;
}
