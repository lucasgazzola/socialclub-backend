import { IsEnum, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { EstadoSolicitudInscripcion } from '@prisma/client';

export class MisSolicitudesQueryDto {
  @ApiPropertyOptional({
    description: 'Filtrar por estado de la solicitud',
    enum: EstadoSolicitudInscripcion,
    example: EstadoSolicitudInscripcion.PENDIENTE,
  })
  @IsOptional()
  @IsEnum(EstadoSolicitudInscripcion, {
    message:
      'El estado debe ser uno de: PENDIENTE, PENDIENTE_DOCUMENTACION, APROBADA, RECHAZADA, CANCELADA',
  })
  estado?: EstadoSolicitudInscripcion;
}
