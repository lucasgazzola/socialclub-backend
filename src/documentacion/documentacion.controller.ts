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

  @Get('persona/:personaId')
  @Roles('ADMIN', 'DELEGADO')
  @ApiOperation({ summary: 'Listar la documentación de un participante' })
  @ApiOkResponse({ description: 'Documentos del participante' })
  @ApiErrores({
    400: VALIDACION,
    401: 'Unauthorized',
    403: 'No tenés permisos suficientes para esta operación',
    404: 'Participante no encontrado',
  })
  findByPersona(@Param('personaId', ParseIntPipe) personaId: number) {
    return this.documentacionService.findByPersona(personaId);
  }

  @Get('persona/:personaId/estado')
  @Roles('ADMIN', 'DELEGADO')
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
  estadoPorPersona(@Param('personaId', ParseIntPipe) personaId: number) {
    return this.estadoDocumental.porPersona(personaId);
  }

  @Get(':id/archivo')
  @Roles('ADMIN', 'DELEGADO')
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
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { rutaAbsoluta, nombre, mimeType } = await this.documentacionService.obtenerArchivo(id);
    res.set({
      'Content-Type': mimeType,
      'Content-Disposition': `inline; filename="${encodeURIComponent(nombre)}"`,
    });
    return new StreamableFile(createReadStream(rutaAbsoluta));
  }
}
