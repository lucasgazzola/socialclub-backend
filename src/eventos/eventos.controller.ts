import { Body, Controller, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { EventosService } from './eventos.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CrearEventoDto } from './dto/crear-evento.dto';
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

  @Get()
  @Roles('ADMIN', 'COLABORADOR')
  @ApiOperation({ summary: 'Listar todos los eventos' })
  findAll() {
    return this.eventosService.findAll();
  }

  @Get(':id')
  @Roles('ADMIN', 'COLABORADOR')
  @ApiOperation({ summary: 'Obtener un evento por id' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.eventosService.findOne(id);
  }
}
