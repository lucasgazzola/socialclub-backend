import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, Max, Min } from 'class-validator';

export class CrearEntradasDto {
  @ApiProperty({ example: 1, description: 'ID del evento' })
  @IsInt()
  @IsNotEmpty()
  eventoId: number;

  @ApiProperty({
    example: 5,
    description: 'Cantidad de entradas a generar',
    minimum: 1,
    maximum: 100,
  })
  @IsInt()
  @Min(1)
  @Max(100)
  cantidad: number;
}
