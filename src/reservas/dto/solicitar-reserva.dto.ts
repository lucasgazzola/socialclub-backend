import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Matches, Min } from 'class-validator';

const FECHA_ISO_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const HORA_INICIO_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
const HORA_FIN_REGEX = /^(([01]\d|2[0-3]):[0-5]\d|24:00)$/;

/** US-59: cálculo de presupuesto y verificación en tiempo real antes de solicitar. */
export class PresupuestoReservaDto {
  @ApiProperty({ description: 'ID del espacio a reservar', example: 1 })
  @Type(() => Number)
  @IsInt({ message: 'El espacioId debe ser un número entero' })
  @Min(1, { message: 'El espacioId debe ser mayor a 0' })
  espacioId!: number;

  @ApiProperty({
    description: 'Fecha de la reserva (YYYY-MM-DD, hora del club)',
    example: '2026-11-20',
  })
  @Matches(FECHA_ISO_REGEX, { message: 'La fecha debe tener formato YYYY-MM-DD' })
  fecha!: string;

  @ApiPropertyOptional({
    description: 'Hora de inicio (HH:MM, requerida si el espacio es POR_HORA)',
    example: '18:00',
  })
  @IsOptional()
  @Matches(HORA_INICIO_REGEX, { message: 'La hora de inicio debe tener formato HH:MM' })
  horaInicio?: string;

  @ApiPropertyOptional({
    description: 'Hora de fin (HH:MM o 24:00, requerida si el espacio es POR_HORA)',
    example: '20:00',
  })
  @IsOptional()
  @Matches(HORA_FIN_REGEX, { message: 'La hora de fin debe tener formato HH:MM o 24:00' })
  horaFin?: string;
}

/** US-59: solicitud de reserva de espacio (estado inicial PENDIENTE_APROBACION). */
export class CreateReservaDto extends PresupuestoReservaDto {}
