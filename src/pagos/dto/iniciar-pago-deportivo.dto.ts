import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsInt, Matches, Min, ValidateNested } from 'class-validator';

/** Un mes de una disciplina que el socio quiere pagar online. */
export class ItemPagoDeportivoDto {
  @ApiProperty({ example: 3, description: 'Disciplina de la cuota' })
  @Type(() => Number)
  @IsInt({ message: 'La disciplina indicada no es válida' })
  @Min(1, { message: 'La disciplina indicada no es válida' })
  disciplinaId: number;

  @ApiProperty({ example: '2026-08', description: 'Período YYYY-MM' })
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: 'Cada período debe tener el formato YYYY-MM',
  })
  periodo: string;
}

/** DT-35: meses de cuota deportiva que la persona quiere pagar online. */
export class IniciarPagoDeportivoDto {
  @ApiProperty({ type: [ItemPagoDeportivoDto] })
  @IsArray({ message: 'El campo items debe ser una lista' })
  @ArrayNotEmpty({ message: 'Debe seleccionar al menos un período para abonar' })
  @ValidateNested({ each: true })
  @Type(() => ItemPagoDeportivoDto)
  items: ItemPagoDeportivoDto[];
}
