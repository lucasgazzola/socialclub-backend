import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { ApiErrores, VALIDACION } from '../common/swagger/respuestas';
import { EspaciosService } from './espacios.service';
import { CreateEspacioDto } from './dto/create-espacio.dto';
import { CreateBloqueoDto } from './dto/create-bloqueo.dto';
import { FindEspaciosQueryDto } from './dto/find-espacios-query.dto';

const SIN_PERMISO = 'No tenés permisos suficientes para esta operación';
const NO_ENCONTRADO = 'Espacio no encontrado';

@ApiTags('espacios')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('espacios')
export class EspaciosController {
  constructor(private readonly espaciosService: EspaciosService) {}

  @Post()
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'US-55 — Registrar nuevo espacio físico con disciplinas compatibles y bloqueos',
  })
  @ApiCreatedResponse({ description: 'Espacio registrado exitosamente' })
  @ApiErrores({
    400: [
      VALIDACION,
      'Los espacios de tipo SOCIAL no pueden asociarse a disciplinas deportivas.',
      'El monto de la seña requerida no puede ser superior al precio total de alquiler.',
      'Los bloqueos recurrentes deben indicar al menos un día de la semana (0 a 6).',
    ],
    401: 'Unauthorized',
    403: SIN_PERMISO,
  })
  create(@Body() dto: CreateEspacioDto, @CurrentUser() user: AuthenticatedUser) {
    return this.espaciosService.create(dto, user.id);
  }

  @Get()
  @Roles('ADMIN', 'COLABORADOR', 'SOCIO', 'DELEGADO')
  @ApiOperation({ summary: 'Listar espacios físicos del club' })
  @ApiOkResponse({ description: 'Listado de espacios físicos' })
  @ApiErrores({ 401: 'Unauthorized', 403: SIN_PERMISO })
  findAll(@Query() query: FindEspaciosQueryDto) {
    return this.espaciosService.findAll(query);
  }

  @Get(':id')
  @Roles('ADMIN', 'COLABORADOR', 'SOCIO', 'DELEGADO')
  @ApiOperation({ summary: 'Consultar detalle de un espacio físico' })
  @ApiOkResponse({ description: 'Detalle del espacio y sus bloqueos activos' })
  @ApiErrores({ 401: 'Unauthorized', 403: SIN_PERMISO, 404: NO_ENCONTRADO })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.espaciosService.findOne(id);
  }

  @Post(':id/bloqueos')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'US-55 / US-56 — Configurar bloqueo de agenda para un espacio existente',
  })
  @ApiCreatedResponse({ description: 'Bloqueo configurado exitosamente' })
  @ApiErrores({
    400: [VALIDACION, 'La hora de fin del bloqueo debe ser posterior a la hora de inicio.'],
    401: 'Unauthorized',
    403: SIN_PERMISO,
    404: NO_ENCONTRADO,
    409: 'El bloqueo entra en conflicto con una reserva particular aprobada.',
  })
  agregarBloqueo(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateBloqueoDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.espaciosService.agregarBloqueo(id, dto, user.id);
  }
}
