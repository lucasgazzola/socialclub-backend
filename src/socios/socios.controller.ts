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
import { SociosService } from './socios.service';
import { CreateSocioDto } from './dto/create-socio.dto';
import { RegistrarSocioDto } from './dto/registrar-socio.dto';
import { UpdateSocioDto } from './dto/update-socio.dto';
import { UpdatePerfilSocioDto } from './dto/update-perfil-socio.dto';
import { FindSociosQueryDto } from './dto/find-socios-query.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { ApiErrores, VALIDACION } from '../common/swagger/respuestas';

@ApiTags('socios')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('socios')
export class SociosController {
  constructor(private readonly sociosService: SociosService) {}

  @Post()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'US-12 — Registrar socio' })
  @ApiCreatedResponse({ description: 'Socio creado' })
  @ApiErrores({
    400: [
      VALIDACION,
      'La categoría de socio seleccionada no existe',
      'No hay categorías de socio configuradas',
    ],
    401: 'Unauthorized',
    403: 'No tenés permisos suficientes para esta operación',
    409: [
      'Ya existe un socio activo con ese DNI',
      'Ya existe una persona registrada con ese email',
    ],
  })
  create(@Body() dto: CreateSocioDto, @CurrentUser() user: AuthenticatedUser) {
    return this.sociosService.create(dto, user.id);
  }

  // 'Registrarme como socio' es accesible para cualquier usuario autenticado
  @Post('registrar')
  @ApiOperation({ summary: 'US-09 — Registrarme como socio' })
  @ApiCreatedResponse({ description: 'Membresía creada: el usuario pasa a ser socio' })
  @ApiErrores({
    400: [
      VALIDACION,
      'El DNI es obligatorio para registrarte como socio',
      'El rol SOCIO no está configurado en el sistema',
      'El usuario no tiene una ficha de persona vinculada',
      'La categoría de socio seleccionada no existe',
    ],
    401: ['El usuario no está habilitado para autogestionarse como socio', 'Unauthorized'],
    409: [
      'Ya existe otra persona registrada con ese DNI',
      'Ya sos socio: tu ficha de socio ya tiene una membresía activa',
    ],
  })
  registrarmeComoSocio(@Body() dto: RegistrarSocioDto, @CurrentUser() user: AuthenticatedUser) {
    return this.sociosService.registrarme(dto, user.id);
  }

  @Get()
  @Roles('ADMIN', 'COLABORADOR')
  @ApiOperation({
    summary: 'US-15 — Buscar y filtrar socios (nombre, DNI, categoría, estado) con paginación',
  })
  @ApiOkResponse({ description: 'Página de socios' })
  @ApiErrores({
    400: VALIDACION,
    401: 'Unauthorized',
    403: 'No tenés permisos suficientes para esta operación',
  })
  findAll(@Query() query: FindSociosQueryDto) {
    return this.sociosService.findAll(query);
  }

  @Get(':id')
  @Roles('ADMIN', 'COLABORADOR')
  @ApiOperation({ summary: 'Obtener un socio por id' })
  @ApiOkResponse({ description: 'Socio' })
  @ApiErrores({
    400: VALIDACION,
    401: 'Unauthorized',
    403: 'No tenés permisos suficientes para esta operación',
    404: 'Socio no encontrado',
  })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.sociosService.findOne(id);
  }

  @Patch('perfil')
  @ApiOperation({ summary: 'Editar datos personales del socio' })
  @ApiOkResponse({ description: 'Datos personales actualizados' })
  @ApiErrores({
    400: VALIDACION,
    401: ['Unauthorized', 'Usuario no habilitado'],
    404: 'No se encontró una ficha de persona asociada a este usuario',
    409: [
      'El correo electrónico ya se encuentra registrado por otra persona',
      'El correo electrónico ya se encuentra registrado por otro usuario',
    ],
  })
  updatePerfil(@Body() dto: UpdatePerfilSocioDto, @CurrentUser() user: AuthenticatedUser) {
    return this.sociosService.updatePerfil(user.id, dto);
  }

  @Patch(':id')
  @Roles('ADMIN', 'COLABORADOR')
  @ApiOperation({ summary: 'US-13 — Editar socio' })
  @ApiOkResponse({ description: 'Socio actualizado' })
  @ApiErrores({
    400: VALIDACION,
    401: 'Unauthorized',
    403: 'No tenés permisos suficientes para esta operación',
    404: 'Socio no encontrado',
    409: [
      'Ya existe otra persona registrada con ese DNI',
      'Ya existe otra persona registrada con ese email',
    ],
  })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSocioDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.sociosService.update(id, dto, user.id);
  }

  @Post('darse-de-baja')
  @ApiOperation({ summary: 'US-42 — Darme de baja como socio' })
  @ApiCreatedResponse({ description: 'Membresía dada de baja' })
  @ApiErrores({
    400: 'El socio ya se encuentra dado de baja',
    401: 'Unauthorized',
    404: ['No se encontró una ficha de persona asociada a este usuario', 'Socio no encontrado'],
  })
  darseDeBaja(@CurrentUser() user: AuthenticatedUser) {
    return this.sociosService.darseDeBaja(user.id);
  }

  @Post('reactivarme')
  @ApiOperation({ summary: 'US-43 — Reactivar mi membresía como ex-socio' })
  @ApiCreatedResponse({ description: 'Membresía reactivada' })
  @ApiErrores({
    400: [
      'El rol SOCIO no está configurado en el sistema',
      'El socio ya se encuentra activo',
      'No hay categorías de socio configuradas',
      'No registrás una membresía previa dada de baja. Para asociarte por primera vez, usá la opción Hacerme socio.',
    ],
    401: ['El usuario no está habilitado para autogestionarse como socio', 'Unauthorized'],
    404: ['No se encontró una ficha de persona asociada a este usuario', 'Socio no encontrado'],
  })
  reactivarme(@CurrentUser() user: AuthenticatedUser) {
    return this.sociosService.reactivarme(user.id);
  }

  @Delete(':id')
  @Roles('ADMIN', 'COLABORADOR')
  @ApiOperation({ summary: 'US-14 — Dar de baja socio (baja lógica)' })
  @ApiOkResponse({ description: 'Socio dado de baja' })
  @ApiErrores({
    400: [VALIDACION, 'El socio ya se encuentra dado de baja'],
    401: 'Unauthorized',
    403: 'No tenés permisos suficientes para esta operación',
    404: 'Socio no encontrado',
  })
  deactivate(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser) {
    return this.sociosService.deactivate(id, user.id);
  }

  @Patch(':id/activar')
  @Roles('ADMIN', 'COLABORADOR')
  @ApiOperation({ summary: 'US-14 / US-43 — Reactivar / Dar de alta socio' })
  @ApiOkResponse({ description: 'Socio reactivado' })
  @ApiErrores({
    400: [VALIDACION, 'El socio ya se encuentra activo', 'No hay categorías de socio configuradas'],
    401: 'Unauthorized',
    403: 'No tenés permisos suficientes para esta operación',
    404: 'Socio no encontrado',
  })
  activate(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser) {
    return this.sociosService.activate(id, user.id);
  }
}
