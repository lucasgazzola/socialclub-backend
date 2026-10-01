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
import { ApiConsumes, ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { createReadStream } from 'node:fs';
import type { Response } from 'express';
import { DocumentacionService } from './documentacion.service';
import { CreateDocumentacionDto } from './dto/create-documentacion.dto';
import { documentacionStorage, type ArchivoSubido } from './storage.config';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';

@ApiTags('documentacion')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('documentacion')
export class DocumentacionController {
  constructor(private readonly documentacionService: DocumentacionService) {}

  @Post()
  @Roles('ADMIN', 'DELEGADO')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'US-24 — Cargar documentación obligatoria (archivo opcional)' })
  @UseInterceptors(FileInterceptor('archivo', documentacionStorage))
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
  findByPersona(@Param('personaId', ParseIntPipe) personaId: number) {
    return this.documentacionService.findByPersona(personaId);
  }

  @Get(':id/archivo')
  @Roles('ADMIN', 'DELEGADO')
  @ApiOperation({ summary: 'Descargar el archivo adjunto de un documento' })
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
