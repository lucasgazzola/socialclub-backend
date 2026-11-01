import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

/** US-52 · TASK-51: qué entradas se quieren comprar. El pago lo hace la pasarela. */
export class ComprarEntradasDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  eventoId: number;

  @ApiProperty({ example: 2 })
  @IsInt()
  @Min(1)
  cantidad: number;
}
