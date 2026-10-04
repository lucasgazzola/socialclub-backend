import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiTags,
  ApiCreatedResponse,
  ApiOkResponse,
} from '@nestjs/swagger';
import { EventosService } from './eventos.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CrearEventoDto } from './dto/crear-evento.dto';
import { ActualizarEventoDto } from './dto/actualizar-evento.dto';
import { FiltrarEventosDto } from './dto/filtrar-eventos.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { ApiErrores, VALIDACION } from '../common/swagger/respuestas';

@ApiTags('eventos')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('eventos')
export class EventosController {
  constructor(private readonly eventosService: EventosService) {}

  @Post()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'US-29 — Crear evento' })
  @ApiCreatedResponse({ description: 'Evento creado' })
  @ApiErrores({
    400: [
      VALIDACION,
      'El descuento para socios solo aplica en eventos con precio mayor a 0',
      'La capacidad máxima debe ser al menos 1',
      'La fecha de fin de venta debe ser posterior o igual a la de inicio de venta',
      'La fecha de fin de venta no puede ser posterior a la fecha del evento',
      'La fecha de fin de venta supera el límite máximo de 3 años',
      'La fecha de fin debe ser posterior a la fecha del evento',
      'La fecha de fin no puede estar en el pasado',
      'La fecha de fin supera el límite máximo de 3 años',
      'La fecha de inicio de venta no puede estar en el pasado',
      'La fecha de inicio de venta supera el límite máximo de 3 años',
      'La fecha del evento no puede estar en el pasado',
      'La fecha del evento supera el límite máximo de 3 años',
      'Las entradas disponibles no pueden ser negativas',
      'Las entradas disponibles no pueden superar la capacidad máxima',
    ],
    401: 'Unauthorized',
    403: 'No tenés permisos suficientes para esta operación',
  })
  create(@Body() dto: CrearEventoDto, @CurrentUser() user: AuthenticatedUser) {
    return this.eventosService.create(dto, user.id);
  }

  @Patch(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'US-29 — Editar evento' })
  @ApiOkResponse({ description: 'Evento actualizado' })
  @ApiErrores({
    400: [
      VALIDACION,
      'El descuento para socios solo aplica en eventos con precio mayor a 0',
      'La capacidad máxima (…) no puede ser menor que las entradas ya vendidas (…)',
      'La fecha de fin de venta debe ser posterior o igual a la de inicio de venta',
      'La fecha de fin de venta no puede ser posterior a la fecha del evento',
      'La fecha de fin de venta supera el límite máximo de 3 años',
      'La fecha de fin debe ser posterior a la fecha del evento',
      'La fecha de fin no puede estar en el pasado',
      'La fecha de fin supera el límite máximo de 3 años',
      'La fecha de inicio de venta no puede estar en el pasado',
      'La fecha de inicio de venta supera el límite máximo de 3 años',
      'La fecha del evento no puede estar en el pasado',
      'La fecha del evento supera el límite máximo de 3 años',
      'Las entradas disponibles no pueden superar la capacidad máxima',
      'No se puede cambiar el estado de … a …',
    ],
    401: 'Unauthorized',
    403: 'No tenés permisos suficientes para esta operación',
    404: 'Evento no encontrado',
    409: 'No se puede cambiar requiereEntrada a false porque existen compras o entradas registradas',
  })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ActualizarEventoDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.eventosService.update(id, dto, user.id);
  }

  @Get()
  @ApiOperation({
    summary: 'Listar eventos paginados con filtros opcionales (?search=, ?pagina=, ?porPagina=)',
  })
  @ApiOkResponse({ description: 'Eventos visibles para el usuario' })
  @ApiErrores({ 400: VALIDACION, 401: 'Unauthorized' })
  findAll(@Query() filtros: FiltrarEventosDto, @CurrentUser() user: AuthenticatedUser) {
    const esAdmin = user?.roles?.includes('ADMIN') ?? false;
    return this.eventosService.findAll(filtros, esAdmin);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener un evento por id' })
  @ApiOkResponse({ description: 'Evento' })
  @ApiErrores({ 400: VALIDACION, 401: 'Unauthorized', 404: 'Evento no encontrado' })
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser) {
    const esAdmin = user?.roles?.includes('ADMIN') ?? false;
    return this.eventosService.findOne(id, esAdmin);
  }
}
