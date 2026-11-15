import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiConsumes,
  ApiCookieAuth,
  ApiOperation,
  ApiTags,
  ApiCreatedResponse,
  ApiOkResponse,
} from '@nestjs/swagger';
import { createReadStream } from 'node:fs';
import type { Response } from 'express';
import { DocumentacionService } from './documentacion.service';
import { EstadoDocumentalService } from './estado-documental.service';
import { CreateDocumentacionDto } from './dto/create-documentacion.dto';
import { SubirMiDocumentacionDto } from './dto/subir-mi-documentacion.dto';
import { RechazarDocumentacionDto } from './dto/rechazar-documentacion.dto';
import { documentacionStorage, type ArchivoSubido } from './storage.config';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { ApiErrores, VALIDACION } from '../common/swagger/respuestas';

@ApiTags('documentacion')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('documentacion')
export class DocumentacionController {
  constructor(
    private readonly documentacionService: DocumentacionService,
    private readonly estadoDocumental: EstadoDocumentalService,
  ) {}

  @Post()
  @Roles('ADMIN', 'DELEGADO')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'US-24 — Cargar documentación obligatoria (archivo opcional)' })
  @UseInterceptors(FileInterceptor('archivo', documentacionStorage))
  @ApiCreatedResponse({ description: 'Documento cargado' })
  @ApiErrores({
    400: [
      VALIDACION,
      'La fecha de vencimiento no puede ser anterior a la fecha actual.',
      'Ninguna disciplina o categoría del participante exige «…».',
      'Tipo de archivo no permitido (solo PDF o imagen).',
    ],
    401: 'Unauthorized',
    403: 'No tenés permisos suficientes para esta operación',
    404: 'Participante no encontrado',
    413: 'File too large',
  })
  create(
    @Body() dto: CreateDocumentacionDto,
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() archivo?: ArchivoSubido,
  ) {
    return this.documentacionService.create(dto, user.id, archivo);
  }

  @Post('mi-documentacion')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'TASK-60 — El titular sube su documento desde Mi club (queda en revisión)',
  })
  @UseInterceptors(FileInterceptor('archivo', documentacionStorage))
  @ApiCreatedResponse({ description: 'Documento subido, pendiente de revisión' })
  @ApiErrores({
    400: [
      VALIDACION,
      'Adjuntá el archivo del documento (PDF o imagen).',
      'La fecha de vencimiento no puede ser anterior a la fecha actual.',
      'Ninguna disciplina o categoría del participante exige «…».',
      'Tipo de archivo no permitido (solo PDF o imagen).',
    ],
    401: 'Unauthorized',
    404: 'No se encontró una ficha de persona asociada al usuario',
    409: 'Ya enviaste «…» y está en revisión.',
    413: 'File too large',
  })
  subirMiDocumentacion(
    @Body() dto: SubirMiDocumentacionDto,
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() archivo?: ArchivoSubido,
  ) {
    return this.documentacionService.subirPropia(user.id, dto, archivo);
  }

  @Get('pendientes-revision')
  @Roles('ADMIN', 'DELEGADO')
  @ApiOperation({
    summary: 'TASK-60 — Documentos que subieron los titulares y esperan revisión',
  })
  @ApiOkResponse({ description: 'Pendientes de revisión (el delegado ve los de sus disciplinas)' })
  @ApiErrores({ 401: 'Unauthorized', 403: 'No tenés permisos suficientes para esta operación' })
  pendientesRevision(@CurrentUser() user: AuthenticatedUser) {
    return this.documentacionService.pendientesRevision(user);
  }

  @Patch(':id/aprobar')
  @Roles('ADMIN', 'DELEGADO')
  @ApiOperation({ summary: 'TASK-60 — Aprobar un documento que subió el titular' })
  @ApiOkResponse({ description: 'Documento aprobado: cuenta para la habilitación' })
  @ApiErrores({
    400: VALIDACION,
    401: 'Unauthorized',
    403: [
      'No tenés permisos suficientes para esta operación',
      'El documento es de un participante de otra disciplina.',
    ],
    404: 'Documento no encontrado',
    409: 'El documento ya fue revisado.',
  })
  aprobar(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser) {
    return this.documentacionService.revisar(id, user, { aprobar: true });
  }

  @Patch(':id/rechazar')
  @Roles('ADMIN', 'DELEGADO')
  @ApiOperation({ summary: 'TASK-60 — Rechazar un documento que subió el titular, con motivo' })
  @ApiOkResponse({ description: 'Documento rechazado: el titular puede volver a subirlo' })
  @ApiErrores({
    400: [VALIDACION, 'El motivo del rechazo debe tener al menos 5 caracteres.'],
    401: 'Unauthorized',
    403: [
      'No tenés permisos suficientes para esta operación',
      'El documento es de un participante de otra disciplina.',
    ],
    404: 'Documento no encontrado',
    409: 'El documento ya fue revisado.',
  })
  rechazar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RechazarDocumentacionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.documentacionService.revisar(id, user, { aprobar: false, motivo: dto.motivo });
  }

  @Get('mi-documentacion')
  // DT-58: cualquier usuario con sesión; el servicio exige que sea su propia persona.
  @ApiOperation({
    summary: 'DT-28 — Listar la documentación de la persona asociada al usuario logueado',
  })
  @ApiOkResponse({ description: 'Documentos del participante logueado' })
  @ApiErrores({
    401: 'Unauthorized',
    403: 'No tenés permisos suficientes para esta operación',
    404: 'No se encontró una ficha de persona asociada al usuario',
  })
  async miDocumentacion(@CurrentUser() user: AuthenticatedUser) {
    const personaId = await this.documentacionService.obtenerPersonaIdDeUsuario(user.id);
    return this.documentacionService.findByPersona(personaId);
  }

  @Get('mi-documentacion/estado')
  // DT-58: cualquier usuario con sesión; el servicio exige que sea su propia persona.
  @ApiOperation({
    summary: 'US-25 / DT-28 — Estado documental de la persona asociada al usuario logueado',
  })
  @ApiOkResponse({ description: 'Estado documental de cada inscripción del participante logueado' })
  @ApiErrores({
    401: 'Unauthorized',
    403: 'No tenés permisos suficientes para esta operación',
    404: 'No se encontró una ficha de persona asociada al usuario',
  })
  async miEstadoDocumental(@CurrentUser() user: AuthenticatedUser) {
    const personaId = await this.documentacionService.obtenerPersonaIdDeUsuario(user.id);
    return this.estadoDocumental.porPersona(personaId);
  }

  @Get('persona/:personaId')
  // DT-58: cualquier usuario con sesión; el servicio exige que sea su propia persona.
  @ApiOperation({ summary: 'Listar la documentación de un participante' })
  @ApiOkResponse({ description: 'Documentos del participante' })
  @ApiErrores({
    400: VALIDACION,
    401: 'Unauthorized',
    403: 'No tenés permisos suficientes para esta operación',
    404: 'Participante no encontrado',
  })
  async findByPersona(
    @Param('personaId', ParseIntPipe) personaId: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.documentacionService.validarAccesoPersona(personaId, user);
    return this.documentacionService.findByPersona(personaId);
  }

  @Get('persona/:personaId/estado')
  // DT-58: cualquier usuario con sesión; el servicio exige que sea su propia persona.
  @ApiOperation({
    summary: 'US-25 — Estado documental del participante por inscripción (exigido vs. presentado)',
  })
  @ApiOkResponse({ description: 'Estado documental de cada inscripción del participante' })
  @ApiErrores({
    400: VALIDACION,
    401: 'Unauthorized',
    403: 'No tenés permisos suficientes para esta operación',
    404: 'Participante no encontrado',
  })
  async estadoPorPersona(
    @Param('personaId', ParseIntPipe) personaId: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.documentacionService.validarAccesoPersona(personaId, user);
    return this.estadoDocumental.porPersona(personaId);
  }

  @Get(':id/archivo')
  // DT-58: cualquier usuario con sesión; el servicio exige que sea su propia persona.
  @ApiOperation({ summary: 'Descargar el archivo adjunto de un documento' })
  @ApiOkResponse({ description: 'Archivo adjunto (PDF o imagen)' })
  @ApiErrores({
    400: VALIDACION,
    401: 'Unauthorized',
    403: 'No tenés permisos suficientes para esta operación',
    404: ['El archivo no se encuentra en el servidor', 'El documento no tiene un archivo adjunto'],
  })
  async descargarArchivo(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { rutaAbsoluta, nombre, mimeType } = await this.documentacionService.obtenerArchivo(
      id,
      user,
    );
    res.set({
      'Content-Type': mimeType,
      'Content-Disposition': `inline; filename="${encodeURIComponent(nombre)}"`,
    });
    return new StreamableFile(createReadStream(rutaAbsoluta));
  }
}
