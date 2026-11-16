import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsString, Matches } from 'class-validator';

/** TASK-51: períodos de cuota social que el socio quiere pagar online. */
export class IniciarPagoCuotasDto {
  @ApiProperty({
    description: 'Lista de períodos a abonar en formato YYYY-MM',
    example: ['2026-08', '2026-09'],
  })
  @IsArray()
  @ArrayNotEmpty({ message: 'Debe seleccionar al menos un período para abonar' })
  @IsString({ each: true })
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    each: true,
    message: 'Cada período debe tener el formato YYYY-MM',
  })
  periodos: string[];
}
