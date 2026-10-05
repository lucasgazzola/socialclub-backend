import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Patch,
  UseGuards,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { InscripcionService } from './inscripcion.service';
import { CreateInscripcionDto } from './dto/create-inscripcion.dto';
import { UpdateInscripcionDto } from './dto/update-inscripcion.dto';
import { FindParticipantesQueryDto } from './dto/find-participantes-query.dto';
import { RequisitosInscripcionQueryDto } from './dto/requisitos-inscripcion-query.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { Roles } from '../common/decorators/roles.decorator';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiTags,
  ApiCreatedResponse,
  ApiOkResponse,
} from '@nestjs/swagger';
import { RolesGuard } from '../common/guards/roles.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ApiErrores, VALIDACION } from '../common/swagger/respuestas';

@ApiTags('inscripcion')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
// DT-16: los roles se declaran a nivel de clase, no por handler. RolesGuard
// deja pasar cuando no hay roles requeridos, así que un handler sin @Roles
// queda abierto a cualquier usuario autenticado: con la restricción acá, lo
// que se agregue después nace protegido y hay que optar explícitamente por
// ampliarlo.
@Roles('ADMIN', 'DELEGADO')
@Controller('inscripcion')
export class InscripcionController {
  constructor(private readonly inscripcionService: InscripcionService) {}

  @Post()
  @ApiOperation({ summary: 'US — Inscribir a un participante en una disciplina' })
  @ApiCreatedResponse({ description: 'Inscripción creada (o reactivada) con su estado documental' })
  @ApiErrores({
    400: [
      VALIDACION,
      'Debe seleccionar una categoría para inscribirse en esta disciplina',
      'Disciplina inactiva',
      'El participante está dado de baja: hay que reactivarlo antes de inscribirlo',
      'El participante no cumple las restricciones de …. …',
      'Faltan los datos básicos del participante nuevo (nombre, apellido y DNI)',
      'La categoría indicada no pertenece a esta disciplina o no está activa',
      'La fecha de vencimiento no puede ser anterior a la fecha actual.',
      'Ninguna disciplina o categoría de la inscripción exige «…».',
    ],
    401: 'Unauthorized',
    403: 'No tenés permisos suficientes para esta operación',
    404: ['Disciplina no encontrada', 'Participante no encontrado'],
    409: [
      'El email ya está registrado por otra persona',
      'Ya existe un participante con ese DNI inscripto en esta disciplina',
    ],
  })
  create(@Body() dto: CreateInscripcionDto, @CurrentUser() user: AuthenticatedUser) {
    return this.inscripcionService.create(dto, user.id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'US-06 — Editar participante (datos básicos, disciplina y/o categoría)',
  })
  @ApiOkResponse({ description: 'Participante e inscripción actualizados' })
  @ApiErrores({
    400: [
      VALIDACION,
      'Debe seleccionar una categoría para esta disciplina',
      'Disciplina inactiva',
      'El participante no cumple las restricciones de …. …',
      'La categoría indicada no pertenece a esta disciplina o no está activa',
      'La inscripción está dada de baja: hay que reinscribir al participante antes de editarlo',
    ],
    401: 'Unauthorized',
    403: 'No tenés permisos suficientes para esta operación',
    404: ['Disciplina destino no encontrada', 'Inscripción no encontrada'],
    409: [
      'El email ya está registrado por otra persona',
      'El participante ya está inscripto en la disciplina destino',
      'Ya existe un participante con ese DNI en esta disciplina',
    ],
  })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateInscripcionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.inscripcionService.update(id, dto, user.id);
  }

  @Get()
  @Roles('ADMIN', 'COLABORADOR', 'DELEGADO')
  @ApiOperation({
    summary: 'US-08 — Buscar y filtrar participantes (nombre, disciplina, estado)',
  })
  @ApiOkResponse({ description: 'Página de participantes' })
  @ApiErrores({
    400: VALIDACION,
    401: 'Unauthorized',
    403: 'No tenés permisos suficientes para esta operación',
  })
  findAll(@Query() query: FindParticipantesQueryDto) {
    return this.inscripcionService.findAll(query);
  }

  @Get('requisitos')
  @ApiOperation({
    summary:
      'US-05 — Restricciones y documentación exigida para una disciplina/categoría (antes de inscribir)',
  })
  @ApiOkResponse({ description: 'Documentación que se le exigirá y si ya la tiene presentada' })
  @ApiErrores({
    400: VALIDACION,
    401: 'Unauthorized',
    403: 'No tenés permisos suficientes para esta operación',
    404: ['Disciplina no encontrada', 'La categoría no pertenece a esta disciplina'],
  })
  requisitos(@Query() query: RequisitosInscripcionQueryDto) {
    return this.inscripcionService.requisitos(
      query.disciplinaId,
      query.categoriaDisciplinaId,
      query.personaId,
    );
  }

  @Get('persona/:personaId')
  @ApiOperation({
    summary:
      'Obtener inscripciones de una persona (por defecto solo vigentes; ?incluirBajas=true las incluye todas)',
  })
  @ApiOkResponse({ description: 'Inscripciones de la persona' })
  @ApiErrores({
    400: VALIDACION,
    401: 'Unauthorized',
    403: 'No tenés permisos suficientes para esta operación',
  })
  findByPersonaId(
    @Param('personaId', ParseIntPipe) personaId: number,
    @Query('incluirBajas') incluirBajas?: string,
  ) {
    return this.inscripcionService.findByPersonaId(personaId, incluirBajas === 'true');
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener una inscripción por id' })
  @ApiOkResponse({ description: 'Inscripción' })
  @ApiErrores({
    400: VALIDACION,
    401: 'Unauthorized',
    403: 'No tenés permisos suficientes para esta operación',
    404: 'Inscripción no encontrada',
  })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.inscripcionService.findOne(id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Dar de baja una inscripción (baja lógica, auditada)' })
  @ApiOkResponse({ description: 'Inscripción dada de baja' })
  @ApiErrores({
    400: [VALIDACION, 'La inscripción ya está dada de baja'],
    401: 'Unauthorized',
    403: 'No tenés permisos suficientes para esta operación',
    404: 'Inscripción no encontrada',
  })
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser) {
    return this.inscripcionService.remove(id, user.id);
  }

  @Delete('persona/:personaId')
  @ApiOperation({
    summary: 'US-07 — Dar de baja a un participante (baja lógica en todas sus disciplinas)',
  })
  @ApiOkResponse({ description: 'Participante dado de baja en todas sus disciplinas' })
  @ApiErrores({
    400: [VALIDACION, 'El participante ya está dado de baja'],
    401: 'Unauthorized',
    403: 'No tenés permisos suficientes para esta operación',
    404: 'Participante no encontrado',
  })
  darDeBajaParticipante(
    @Param('personaId', ParseIntPipe) personaId: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.inscripcionService.darDeBajaParticipante(personaId, user.id);
  }

  @Patch('persona/:personaId/activar')
  @ApiOperation({
    summary: 'US-07 — Reactivar a un participante dado de baja',
  })
  @ApiOkResponse({ description: 'Participante reactivado' })
  @ApiErrores({
    400: [VALIDACION, 'El participante ya está activo'],
    401: 'Unauthorized',
    403: 'No tenés permisos suficientes para esta operación',
    404: 'Participante no encontrado',
  })
  activarParticipante(
    @Param('personaId', ParseIntPipe) personaId: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.inscripcionService.activarParticipante(personaId, user.id);
  }
}
