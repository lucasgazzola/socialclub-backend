import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsString, Matches, Min } from 'class-validator';

export class ComprarEntradasDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  eventoId: number;

  @ApiProperty({ example: 2 })
  @IsInt()
  @Min(1)
  cantidad: number;

  @ApiProperty({ example: 'JUAN PEREZ' })
  @IsString()
  @IsNotEmpty()
  titular: string;

  @ApiProperty({ example: '4500000000000000' })
  @IsString()
  @Matches(/^\d{16}$/, { message: 'El número de tarjeta debe tener 16 dígitos' })
  numeroTarjeta: string;

  @ApiProperty({ example: '12/28' })
  @IsString()
  @Matches(/^(0[1-9]|1[0-2])\/\d{2}$/, { message: 'El vencimiento debe tener formato MM/AA' })
  vencimiento: string;

  @ApiProperty({ example: '123' })
  @IsString()
  @Matches(/^\d{3,4}$/, { message: 'El CVC debe tener 3 o 4 dígitos' })
  cvc: string;
}
