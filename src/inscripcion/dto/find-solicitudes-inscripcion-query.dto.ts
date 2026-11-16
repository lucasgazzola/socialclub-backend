import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { EstadoSolicitudInscripcion } from '@prisma/client';

/**
 * US-66: Query params para listar solicitudes de inscripción a disciplinas en el panel.
 * Por defecto lista las solicitudes pendientes, incluyendo las que requieren documentación.
 */
export class FindSolicitudesInscripcionQueryDto {
  @ApiPropertyOptional({
    description: 'Filtrar por estado de la solicitud (PENDIENTE incluye PENDIENTE_DOCUMENTACION)',
    enum: EstadoSolicitudInscripcion,
    example: EstadoSolicitudInscripcion.PENDIENTE,
  })
  @IsOptional()
  @IsEnum(EstadoSolicitudInscripcion, {
    message:
      'El estado debe ser uno de: PENDIENTE, PENDIENTE_DOCUMENTACION, APROBADA, RECHAZADA, CANCELADA',
  })
  estado?: EstadoSolicitudInscripcion;

  @ApiPropertyOptional({
    description: 'Filtrar por disciplina deportiva',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'La disciplina debe ser un identificador numérico entero' })
  @Min(1, { message: 'La disciplina debe ser un identificador positivo' })
  disciplinaId?: number;

  @ApiPropertyOptional({
    description: 'Buscar por nombre, apellido o DNI del socio',
    example: 'Luna',
  })
  @IsOptional()
  @IsString()
  busqueda?: string;
}
