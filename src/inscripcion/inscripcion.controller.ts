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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { InscripcionService } from './inscripcion.service';
import { CreateInscripcionDto } from './dto/create-inscripcion.dto';
import { UpdateInscripcionDto } from './dto/update-inscripcion.dto';
import { SolicitarInscripcionDto } from './dto/solicitar-inscripcion.dto';
import { FindParticipantesQueryDto } from './dto/find-participantes-query.dto';
import { RequisitosInscripcionQueryDto } from './dto/requisitos-inscripcion-query.dto';
import { MisSolicitudesQueryDto } from './dto/mis-solicitudes-query.dto';
import { FindSolicitudesInscripcionQueryDto } from './dto/find-solicitudes-inscripcion-query.dto';
import { RechazarSolicitudInscripcionDto } from './dto/rechazar-solicitud-inscripcion.dto';
import { SubirSolicitudDocumentacionDto } from './dto/subir-solicitud-documentacion.dto';
import { CrearHabilitacionExcepcionalDto } from './dto/crear-habilitacion-excepcional.dto';
import { ActivarParticipanteDto } from './dto/activar-participante.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { Roles } from '../common/decorators/roles.decorator';
import {
  ApiCookieAuth,
  ApiConsumes,
  ApiOperation,
  ApiTags,
  ApiCreatedResponse,
  ApiOkResponse,
} from '@nestjs/swagger';
import { RolesGuard } from '../common/guards/roles.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ApiErrores, VALIDACION } from '../common/swagger/respuestas';
import { documentacionStorage, type ArchivoSubido } from '../documentacion/storage.config';

@ApiTags('inscripcion')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('inscripcion')
export class InscripcionController {
  constructor(private readonly inscripcionService: InscripcionService) {}

  @Post()
  @Roles('ADMIN', 'DELEGADO')
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
  @Roles('ADMIN', 'DELEGADO')
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
    summary: 'US-08 — Buscar y filtrar participantes (nombre, disciplina, estado, documentación)',
  })
  @ApiOkResponse({ description: 'Página de participantes' })
  @ApiErrores({
    400: VALIDACION,
    401: 'Unauthorized',
    403: 'No tenés permisos suficientes para esta operación',
  })
  findAll(@Query() query: FindParticipantesQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.inscripcionService.findAll(query, user);
  }

  @Get('requisitos')
  @Roles('ADMIN', 'DELEGADO')
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

  @Get('catalogo')
  @ApiOperation({
    summary:
      'US-63 — Catálogo de disciplinas y categorías activas con aranceles y documentación requerida',
  })
  @ApiOkResponse({ description: 'Catálogo de disciplinas activas para postulación' })
  @ApiErrores({
    401: 'Unauthorized',
    403: 'No tenés permisos suficientes para esta operación',
  })
  catalogo(@CurrentUser() user: AuthenticatedUser) {
    return this.inscripcionService.catalogo(user.id);
  }

  @Post('solicitar')
  @ApiOperation({ summary: 'US-63 — Solicitar inscripción a una disciplina y categoría activa' })
  @ApiCreatedResponse({ description: 'Solicitud de inscripción registrada en estado PENDIENTE' })
  @ApiErrores({
    400: [
      VALIDACION,
      'Debe seleccionar una categoría para inscribirse en esta disciplina',
      'Disciplina inactiva',
      'El participante está dado de baja: hay que reactivarlo antes de postularse',
      'El participante no cumple las restricciones de …. …',
      'La categoría indicada no pertenece a esta disciplina o no está activa',
    ],
    401: 'Unauthorized',
    403: 'No tenés permisos suficientes para esta operación',
    404: ['Disciplina no encontrada', 'No se encontró una ficha de persona asociada al usuario'],
    409: [
      'Ya te encontrás inscripto en esta disciplina',
      'Ya tenés una solicitud de inscripción pendiente para esta disciplina',
    ],
  })
  solicitar(@Body() dto: SolicitarInscripcionDto, @CurrentUser() user: AuthenticatedUser) {
    return this.inscripcionService.solicitar(dto, user.id);
  }

  @Get('mis-solicitudes')
  @ApiOperation({
    summary:
      'US-64 — Listar solicitudes de inscripción propias del usuario autenticado con filtro opcional por estado',
  })
  @ApiOkResponse({
    description:
      'Historial de solicitudes de inscripción del socio ordenadas cronológicamente de la más reciente a la más antigua',
  })
  @ApiErrores({
    400: VALIDACION,
    401: 'Unauthorized',
    403: 'No tenés permisos suficientes para esta operación',
    404: 'No se encontró una ficha de persona asociada al usuario',
  })
  misSolicitudes(@CurrentUser() user: AuthenticatedUser, @Query() query: MisSolicitudesQueryDto) {
    return this.inscripcionService.misSolicitudes(user.id, query.estado);
  }

  @Get('solicitudes')
  @Roles('ADMIN', 'DELEGADO')
  @ApiOperation({
    summary:
      'US-66 — Listar solicitudes de inscripción a disciplinas (por defecto PENDIENTE) con filtros y estado documental',
  })
  @ApiOkResponse({
    description:
      'Listado de solicitudes de inscripción con información del socio, disciplina/categoría y documentación obligatoria',
  })
  @ApiErrores({
    400: VALIDACION,
    401: 'Unauthorized',
    403: 'No tenés permisos suficientes para esta operación',
  })
  listarSolicitudes(@Query() query: FindSolicitudesInscripcionQueryDto) {
    return this.inscripcionService.listarSolicitudes(query);
  }

  @Patch('solicitudes/:id/aprobar')
  @Roles('ADMIN', 'DELEGADO')
  @ApiOperation({
    summary:
      'US-66 — Aprobar solicitud de inscripción: cambia a APROBADA, crea la inscripción y genera la cuota deportiva',
  })
  @ApiOkResponse({
    description:
      'Solicitud aprobada, inscripción creada en estado Habilitada o Pendiente de documentación y cuota deportiva generada',
  })
  @ApiErrores({
    400: [
      VALIDACION,
      'Solo se pueden aprobar solicitudes de inscripción pendientes',
      'El participante está dado de baja: hay que reactivarlo antes de inscribirlo',
      'Disciplina inactiva',
      'La categoría indicada no pertenece a esta disciplina o no está activa',
    ],
    401: 'Unauthorized',
    403: 'No tenés permisos suficientes para esta operación',
    404: 'Solicitud de inscripción no encontrada',
    409: [
      'El socio ya se encuentra inscripto en esta disciplina',
      'La solicitud cambió de estado mientras tanto. Actualizá la página.',
    ],
  })
  aprobarSolicitud(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser) {
    return this.inscripcionService.aprobarSolicitud(id, user.id);
  }

  @Patch('solicitudes/:id/rechazar')
  @Roles('ADMIN', 'DELEGADO')
  @ApiOperation({
    summary: 'US-66 — Rechazar solicitud de inscripción con motivo obligatorio',
  })
  @ApiOkResponse({ description: 'Solicitud rechazada con motivo registrado' })
  @ApiErrores({
    400: [
      VALIDACION,
      'El motivo de rechazo es obligatorio',
      'Solo se pueden rechazar solicitudes de inscripción pendientes',
    ],
    401: 'Unauthorized',
    403: 'No tenés permisos suficientes para esta operación',
    404: 'Solicitud de inscripción no encontrada',
    409: 'La solicitud cambió de estado mientras tanto. Actualizá la página.',
  })
  rechazarSolicitud(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RechazarSolicitudInscripcionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.inscripcionService.rechazarSolicitud(id, dto, user.id);
  }

  @Patch('solicitudes/:id/cancelar')
  @ApiOperation({ summary: 'US-65 — Cancelar una solicitud de inscripción pendiente propia' })
  @ApiOkResponse({ description: 'Solicitud cancelada' })
  @ApiErrores({
    400: [VALIDACION, 'Solo se pueden cancelar solicitudes en estado PENDIENTE'],
    401: 'Unauthorized',
    403: 'No tenés permisos suficientes para esta operación',
    404: ['Solicitud no encontrada', 'No se encontró una ficha de persona asociada al usuario'],
  })
  cancelarSolicitud(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser) {
    return this.inscripcionService.cancelarSolicitud(id, user.id);
  }

  @Post('solicitudes/:id/documentacion')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'US-65 — Adjuntar documentación a una solicitud propia' })
  @ApiCreatedResponse({ description: 'Documentación enviada a revisión' })
  @UseInterceptors(FileInterceptor('archivo', documentacionStorage))
  @ApiErrores({
    400: [VALIDACION, 'Adjuntá el archivo del documento (PDF o imagen).'],
    401: 'Unauthorized',
    404: 'Solicitud no encontrada',
    409: 'La solicitud no admite documentación en su estado actual',
  })
  subirDocumentacionSolicitud(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SubirSolicitudDocumentacionDto,
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() archivo?: ArchivoSubido,
  ) {
    return this.inscripcionService.subirDocumentacionSolicitud(id, user.id, dto, archivo);
  }

  @Get('persona/:personaId')
  @Roles('ADMIN', 'DELEGADO')
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
    @CurrentUser() user: AuthenticatedUser,
    @Param('personaId', ParseIntPipe) personaId: number,
    @Query('incluirBajas') incluirBajas?: string,
  ) {
    return this.inscripcionService.findByPersonaId(personaId, incluirBajas === 'true', user);
  }

  @Get('persona/:personaId/pre-alta')
  @Roles('ADMIN', 'DELEGADO')
  @ApiOperation({
    summary:
      'Pre-evaluar reactivación de un participante: deudas pendientes e historial de disciplinas con validación de restricciones',
  })
  @ApiOkResponse({ description: 'Resumen de deuda e historial de disciplinas para re-alta' })
  @ApiErrores({
    400: VALIDACION,
    401: 'Unauthorized',
    403: 'No tenés permisos suficientes para esta operación',
    404: 'Participante no encontrado',
  })
  preEvaluarAlta(@Param('personaId', ParseIntPipe) personaId: number) {
    return this.inscripcionService.preEvaluarAlta(personaId);
  }

  @Get(':id')
  @Roles('ADMIN', 'DELEGADO')
  @ApiOperation({ summary: 'Obtener una inscripción por id' })
  @ApiOkResponse({ description: 'Inscripción' })
  @ApiErrores({
    400: VALIDACION,
    401: 'Unauthorized',
    403: [
      'No tenés permisos suficientes para esta operación',
      'La inscripción es de una disciplina que no tenés a cargo',
    ],
    404: 'Inscripción no encontrada',
  })
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser) {
    return this.inscripcionService.findOne(id, user);
  }

  @Delete(':id')
  @Roles('ADMIN', 'DELEGADO')
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
  @Roles('ADMIN', 'DELEGADO')
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
  @Roles('ADMIN', 'DELEGADO')
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
    @Body() dto?: ActivarParticipanteDto,
  ) {
    return this.inscripcionService.activarParticipante(personaId, user.id, dto);
  }

  @Post(':id/habilitacion-excepcional')
  @Roles('ADMIN')
  @ApiOperation({
    summary:
      'US-28 — Habilitar participante con documentación vencida (levantamiento manual excepcional)',
  })
  @ApiCreatedResponse({ description: 'Habilitación excepcional registrada y bloqueo levantado' })
  @ApiErrores({
    400: [
      VALIDACION,
      'La inscripción no se encuentra bloqueada por documentación',
      'La inscripción está dada de baja: no puede recibir habilitaciones excepcionales',
      'El participante está dado de baja: hay que reactivarlo antes de otorgar una excepción',
    ],
    401: 'Unauthorized',
    403: 'No tenés permisos suficientes para esta operación',
    404: 'Inscripción no encontrada',
  })
  habilitarExcepcional(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CrearHabilitacionExcepcionalDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.inscripcionService.habilitarExcepcional(id, dto, user.id);
  }

  @Get(':id/habilitaciones-excepcionales')
  @Roles('ADMIN', 'DELEGADO')
  @ApiOperation({
    summary: 'US-28 — Listar historial de habilitaciones excepcionales de una inscripción',
  })
  @ApiOkResponse({ description: 'Historial de habilitaciones excepcionales' })
  @ApiErrores({
    400: VALIDACION,
    401: 'Unauthorized',
    403: [
      'No tenés permisos suficientes para esta operación',
      'La inscripción es de una disciplina que no tenés a cargo',
    ],
    404: 'Inscripción no encontrada',
  })
  listarHabilitacionesExcepcionales(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.inscripcionService.listarHabilitacionesExcepcionales(id, user);
  }
}
