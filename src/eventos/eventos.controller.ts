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
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { EventosService } from './eventos.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CrearEventoDto } from './dto/crear-evento.dto';
import { ActualizarEventoDto } from './dto/actualizar-evento.dto';
import { FiltrarEventosDto } from './dto/filtrar-eventos.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';

@ApiTags('eventos')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('eventos')
export class EventosController {
  constructor(private readonly eventosService: EventosService) {}

  @Post()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'US-29 — Crear evento' })
  create(@Body() dto: CrearEventoDto, @CurrentUser() user: AuthenticatedUser) {
    return this.eventosService.create(dto, user.id);
  }

  @Patch(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'US-29 — Editar evento' })
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
  findAll(@Query() filtros: FiltrarEventosDto, @CurrentUser() user: AuthenticatedUser) {
    const esAdmin = user?.roles?.includes('ADMIN') ?? false;
    return this.eventosService.findAll(filtros, esAdmin);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener un evento por id' })
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser) {
    const esAdmin = user?.roles?.includes('ADMIN') ?? false;
    return this.eventosService.findOne(id, esAdmin);
  }
}
