import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
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

  @Get('mi-documentacion')
  @Roles('ADMIN', 'DELEGADO', 'COLABORADOR', 'SOCIO')
  @ApiOperation({ summary: 'DT-28 — Listar la documentación de la persona asociada al usuario logueado' })
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
  @Roles('ADMIN', 'DELEGADO', 'COLABORADOR', 'SOCIO')
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
  @Roles('ADMIN', 'DELEGADO', 'COLABORADOR', 'SOCIO')
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
  @Roles('ADMIN', 'DELEGADO', 'COLABORADOR', 'SOCIO')
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
  @Roles('ADMIN', 'DELEGADO', 'COLABORADOR', 'SOCIO')
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
    const { rutaAbsoluta, nombre, mimeType } = await this.documentacionService.obtenerArchivo(id, user);
    res.set({
      'Content-Type': mimeType,
      'Content-Disposition': `inline; filename="${encodeURIComponent(nombre)}"`,
    });
    return new StreamableFile(createReadStream(rutaAbsoluta));
  }
}
