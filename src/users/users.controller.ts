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
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';

@ApiTags('users')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN') // toda la gestión de usuarios es exclusiva de administradores
@Controller('users')
export class UsersController {
  constructor(private readonly usuariosService: UsersService) {}

  @Post()
  @ApiOperation({ summary: 'US-01 — Registrar usuario administrativo' })
  create(@Body() dto: CreateUserDto, @CurrentUser() user: AuthenticatedUser) {
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
    @Body() dto: UpdateUserDto,
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
