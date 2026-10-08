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
import {
  ApiCookieAuth,
  ApiOperation,
  ApiTags,
  ApiCreatedResponse,
  ApiOkResponse,
} from '@nestjs/swagger';
import { UsuariosService } from './usuarios.service';
import { CreateUsuarioDto } from './dto/create-usuario.dto';
import { UpdateUsuarioDto } from './dto/update-usuario.dto';
import { GetUsuariosQueryDto } from './dto/get-usuarios-query.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { ApiErrores, VALIDACION } from '../common/swagger/respuestas';
import { UsuarioRespuestaDto, UsuariosPaginadosDto } from './dto/usuario-respuesta.dto';

@ApiTags('usuarios')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN') // toda la gestión de usuarios es exclusiva de administradores
@Controller('usuarios')
export class UsuariosController {
  constructor(private readonly usuariosService: UsuariosService) {}

  @Post()
  @ApiOperation({ summary: 'US-01 — Registrar usuario administrativo' })
  @ApiCreatedResponse({ description: 'Usuario creado', type: UsuarioRespuestaDto })
  @ApiErrores({
    400: [VALIDACION, 'Solo los usuarios con rol DELEGADO pueden tener disciplinas a cargo.'],
    401: 'Unauthorized',
    403: 'No tenés permisos suficientes para esta operación',
    404: [
      'Una o más disciplinas indicadas no existen o están inactivas',
      'Uno o más roles indicados no existen',
    ],
    409: [
      'Ya existe otra persona con ese DNI',
      'Ya existe otro usuario con ese email',
      'Ya existe otro usuario o persona con ese DNI o correo',
      'Ya existe un usuario administrativo asociado a esa persona (mismo DNI).',
      'Ya existe una persona con ese email',
    ],
  })
  create(@Body() dto: CreateUsuarioDto, @CurrentUser() user: AuthenticatedUser) {
    return this.usuariosService.create(dto, user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Listar usuarios administrativos' })
  @ApiOkResponse({
    description: 'Página de usuarios con los totales por estado',
    type: UsuariosPaginadosDto,
  })
  @ApiErrores({
    400: VALIDACION,
    401: 'Unauthorized',
    403: 'No tenés permisos suficientes para esta operación',
  })
  findAll(@Query() query: GetUsuariosQueryDto) {
    return this.usuariosService.findAll(query);
  }

  @Get('roles')
  @ApiOperation({ summary: 'Listar roles del sistema para asignación y filtros' })
  @ApiOkResponse({ description: 'Listado de roles del sistema' })
  @ApiErrores({
    401: 'Unauthorized',
    403: 'No tenés permisos suficientes para esta operación',
  })
  getRoles() {
    return this.usuariosService.getRoles();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener un usuario por id' })
  @ApiOkResponse({ description: 'Usuario', type: UsuarioRespuestaDto })
  @ApiErrores({
    400: VALIDACION,
    401: 'Unauthorized',
    403: 'No tenés permisos suficientes para esta operación',
    404: 'Usuario no encontrado',
  })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.usuariosService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'US-02 — Editar usuario administrativo' })
  @ApiOkResponse({ description: 'Usuario actualizado', type: UsuarioRespuestaDto })
  @ApiErrores({
    400: [
      VALIDACION,
      'Debes indicar la contraseña actual para cambiar la contraseña.',
      'La contraseña nueva es obligatoria si ingresas la contraseña actual.',
      'Solo los usuarios con rol DELEGADO pueden tener disciplinas a cargo.',
    ],
    401: ['La contraseña actual es incorrecta', 'Unauthorized'],
    403: 'No tenés permisos suficientes para esta operación',
    404: [
      'Una o más disciplinas indicadas no existen o están inactivas',
      'Uno o más roles indicados no existen',
      'Usuario no encontrado',
    ],
    409: [
      'Ya existe otra persona con ese DNI',
      'Ya existe otro usuario con ese email',
      'Ya existe una persona con ese email',
    ],
  })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUsuarioDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.usuariosService.update(id, dto, user.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'US-03 — Dar de baja usuario administrativo (baja lógica)' })
  @ApiOkResponse({ description: 'Usuario dado de baja', type: UsuarioRespuestaDto })
  @ApiErrores({
    400: [VALIDACION, 'El usuario ya está inactivo'],
    401: 'Unauthorized',
    403: 'No tenés permisos suficientes para esta operación',
    404: 'Usuario no encontrado',
  })
  deactivate(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser) {
    return this.usuariosService.deactivate(id, user.id);
  }

  @Patch(':id/activar')
  @ApiOperation({ summary: 'US-03 (complemento) — Reactivar usuario dado de baja' })
  @ApiOkResponse({ description: 'Usuario reactivado', type: UsuarioRespuestaDto })
  @ApiErrores({
    400: [VALIDACION, 'El usuario ya está activo'],
    401: 'Unauthorized',
    403: 'No tenés permisos suficientes para esta operación',
    404: 'Usuario no encontrado',
  })
  activate(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser) {
    return this.usuariosService.activate(id, user.id);
  }
}
