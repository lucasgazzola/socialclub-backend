import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SociosService } from './socios.service';
import { CreateSocioDto } from './dto/create-socio.dto';
import { RegistrarSocioDto } from './dto/registrar-socio.dto';
import { UpdateSocioDto } from './dto/update-socio.dto';
import { FindSociosQueryDto } from './dto/find-socios-query.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';

@ApiTags('socios')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('socios')
export class SociosController {
  constructor(private readonly sociosService: SociosService) {}

  @Post()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'US-12 — Registrar socio' })
  create(@Body() dto: CreateSocioDto, @CurrentUser() user: AuthenticatedUser) {
    return this.sociosService.create(dto, user.id);
  }

  // 'Registrarme como socio' es accesible para cualquier usuario autenticado
  @Post('registrar')
  @ApiOperation({ summary: 'US-09 — Registrarme como socio' })
  registrarmeComoSocio(@Body() dto: RegistrarSocioDto, @CurrentUser() user: AuthenticatedUser) {
    return this.sociosService.registrarme(dto, user.id);
  }

  @Get()
  @Roles('ADMIN', 'COLABORADOR')
  @ApiOperation({
    summary: 'US-15 — Buscar y filtrar socios (nombre, DNI, categoría, estado) con paginación',
  })
  findAll(@Query() query: FindSociosQueryDto) {
    return this.sociosService.findAll(query);
  }

  @Get(':id')
  @Roles('ADMIN', 'COLABORADOR')
  @ApiOperation({ summary: 'Obtener un socio por id' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.sociosService.findOne(id);
  }

  @Patch(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'US-13 — Editar socio' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSocioDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.sociosService.update(id, dto, user.id);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'US-14 — Dar de baja socio (baja lógica)' })
  deactivate(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser) {
    return this.sociosService.deactivate(id, user.id);
  }
}
