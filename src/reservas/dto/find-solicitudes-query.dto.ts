import { ApiPropertyOptional } from '@nestjs/swagger';
import { EstadoReserva } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString } from 'class-validator';

/** US-60: filtros de la bandeja de solicitudes de reserva. */
export class FindSolicitudesQueryDto {
  @ApiPropertyOptional({
    description:
      'Estado o estados (separados por coma) a listar. Por defecto, las pendientes de aprobación.',
    example: 'CANCELADA_USUARIO,CANCELADA_FALTA_PAGO,CANCELADA_INSTITUCION',
  })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.split(',').map((v) => v.trim()) : value,
  )
  @IsEnum(EstadoReserva, { each: true, message: 'El estado de reserva no es válido' })
  estado?: EstadoReserva[];

  @ApiPropertyOptional({ description: 'Busca por nombre, apellido, DNI del solicitante o código' })
  @IsOptional()
  @IsString()
  busqueda?: string;
}
