import { Body, Controller, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DocumentacionService } from './documentacion.service';
import { CreateDocumentacionDto } from './dto/create-documentacion.dto';
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
  @ApiOperation({ summary: 'US-24 — Cargar documentación obligatoria de un participante' })
  create(@Body() dto: CreateDocumentacionDto, @CurrentUser() user: AuthenticatedUser) {
    return this.documentacionService.create(dto, user.id);
  }

  @Get('persona/:personaId')
  @Roles('ADMIN', 'DELEGADO')
  @ApiOperation({ summary: 'Listar la documentación de un participante' })
  findByPersona(@Param('personaId', ParseIntPipe) personaId: number) {
    return this.documentacionService.findByPersona(personaId);
  }
}
