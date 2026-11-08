import { ApiProperty } from '@nestjs/swagger';

export class DashboardEventoDto {
  @ApiProperty({ example: 1, description: 'ID del evento' })
  id: number;

  @ApiProperty({ example: 'Torneo Aniversario', description: 'Nombre del evento' })
  nombre: string;

  @ApiProperty({
    example: '2026-11-20T18:00:00.000Z',
    description: 'Fecha y hora de inicio del evento',
  })
  fechaEvento: Date;

  @ApiProperty({
    example: '2026-11-20T23:00:00.000Z',
    nullable: true,
    description: 'Fecha y hora de fin del evento',
  })
  fechaFin: Date | null;

  @ApiProperty({
    example: 'Sede Central - Entrada Principal',
    description: 'Lugar de acreditación',
  })
  lugarAcreditacion: string;

  @ApiProperty({ example: 100, nullable: true, description: 'Capacidad máxima de asistentes' })
  capacidadMaxima: number | null;

  @ApiProperty({ example: 25, nullable: true, description: 'Entradas disponibles restantes' })
  entradasDisponibles: number | null;

  @ApiProperty({ example: 75, description: 'Cantidad de entradas vendidas' })
  entradasVendidas: number;
}

export class InscripcionesIrregularesDto {
  @ApiProperty({
    example: 5,
    description: 'Total de inscripciones irregulares (pendientes + bloqueadas)',
  })
  total: number;

  @ApiProperty({ example: 3, description: 'Inscripciones con documentación pendiente de entrega' })
  pendientes: number;

  @ApiProperty({
    example: 2,
    description: 'Inscripciones bloqueadas por documentación vencida o plazo agotado',
  })
  bloqueadas: number;
}

export class DashboardResponseDto {
  @ApiProperty({
    example: 150,
    description: 'Total de integrantes activos (socios y participantes)',
  })
  totalIntegrantesActivos: number;

  @ApiProperty({
    example: 12.5,
    description: 'Porcentaje de morosos sobre integrantes activos (un decimal)',
  })
  porcentajeMorosos: number;

  @ApiProperty({ example: 18, description: 'Cantidad total de personas morosas únicas activas' })
  cantidadMorosos: number;

  @ApiProperty({
    example: 7,
    description: 'Cantidad de documentos que vencen dentro de los próximos 10 días',
  })
  documentosPorVencer: number;

  @ApiProperty({
    type: InscripcionesIrregularesDto,
    description: 'Desglose de inscripciones irregulares',
  })
  inscripcionesIrregulares: InscripcionesIrregularesDto;

  @ApiProperty({
    type: [DashboardEventoDto],
    description: 'Listado de los próximos hasta 5 eventos publicados',
  })
  proximosEventos: DashboardEventoDto[];
}
