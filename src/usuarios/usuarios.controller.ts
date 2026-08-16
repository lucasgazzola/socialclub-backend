import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UsuariosService } from './usuarios.service';
import { CreateUsuarioDto } from './dto/create-usuario.dto';
import { UpdateUsuarioDto } from './dto/update-usuario.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';

@ApiTags('usuarios')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN') // toda la gestión de usuarios es exclusiva de administradores
@Controller('usuarios')
export class UsuariosController {
  constructor(private readonly usuariosService: UsuariosService) {}

  @Post()
  @ApiOperation({ summary: 'US-01 — Registrar usuario administrativo' })
  create(@Body() dto: CreateUsuarioDto, @CurrentUser() user: AuthenticatedUser) {
    return this.usuariosService.create(dto, user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Listar usuarios administrativos' })
  findAll() {
    return this.usuariosService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener un usuario por id' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.usuariosService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'US-02 — Editar usuario administrativo' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUsuarioDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.usuariosService.update(id, dto, user.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'US-03 — Dar de baja usuario administrativo (baja lógica)' })
  deactivate(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser) {
    return this.usuariosService.deactivate(id, user.id);
  }

  @Patch(':id/activar')
  @ApiOperation({ summary: 'US-03 (complemento) — Reactivar usuario dado de baja' })
  activate(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser) {
    return this.usuariosService.activate(id, user.id);
  }
}
