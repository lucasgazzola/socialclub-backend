import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEmail, IsInt, IsOptional, IsString, Length } from 'class-validator';

export class CreateSocioDto {
  @ApiProperty({ example: 'Lucas' })
  @IsString()
  nombre: string;

  @ApiProperty({ example: 'Gazzola' })
  @IsString()
  apellido: string;

  @ApiProperty({ example: '40123456' })
  @IsString()
  @Length(6, 20)
  dni: string;

  @ApiPropertyOptional({ example: '2000-05-12' })
  @IsOptional()
  @IsDateString()
  fechaNacimiento?: string;

  @ApiPropertyOptional({ example: 'socio@correo.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: '+54 353 1234567' })
  @IsOptional()
  @IsString()
  telefono?: string;

  @ApiPropertyOptional({ example: 1, description: 'ID de CategoriaSocio' })
  @IsOptional()
  @IsInt()
  categoriaId?: number;
}
