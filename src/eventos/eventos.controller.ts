import { Controller, Get, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { EventosService } from './eventos.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('eventos')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('eventos')
export class EventosController {
  constructor(private readonly eventosService: EventosService) {}

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
