import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, Max, Min } from 'class-validator';

export class CreateTicketsDto {
  @ApiProperty({ example: 1, description: 'ID del evento' })
  @IsInt()
  @IsNotEmpty()
  eventId: number;

  @ApiProperty({
    example: 5,
    description: 'Cantidad de entradas a generar',
    minimum: 1,
    maximum: 100,
  })
  @IsInt()
  @Min(1)
  @Max(100)
  quantity: number;
}
