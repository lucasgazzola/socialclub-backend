import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  ValidateIf,
} from 'class-validator';
import { ConfirmaEmail } from '../../common/decorators/confirma-email.decorator';
import { GeneroDisciplina } from '@prisma/client';

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

  @ApiProperty({ example: '2000-05-12' })
  @IsDateString()
  fechaNacimiento: string;

  @ApiProperty({ enum: GeneroDisciplina, example: GeneroDisciplina.MASCULINO })
  @IsNotEmpty()
  genero: GeneroDisciplina;

  @ApiPropertyOptional({ example: 'socio@correo.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({
    example: 'socio@correo.com',
    description: 'DT-54: el email escrito por segunda vez. Obligatorio si se carga el email.',
  })
  @ValidateIf((o: CreateSocioDto) => !!o.email)
  @IsNotEmpty({ message: 'Confirmá el email.' })
  @ConfirmaEmail('email')
  confirmarEmail?: string;

  @ApiPropertyOptional({ example: '+54 353 1234567' })
  @IsOptional()
  @IsString()
  telefono?: string;

  @ApiPropertyOptional({ example: 1, description: 'ID de CategoriaSocio' })
  @IsOptional()
  @IsInt()
  categoriaId?: number;
}
