import { Controller, Get, Post, Body, Param, Delete, Patch, UseGuards, ParseIntPipe, Query } from '@nestjs/common';
import { InscripcionService } from './inscripcion.service';
import { CreateInscripcionDto } from './dto/create-inscripcion.dto';
import { UpdateInscripcionDto } from './dto/update-inscripcion.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { Roles } from '@/common/decorators/roles.decorator';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RolesGuard } from '../common/guards/roles.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@ApiTags('inscripcion')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('inscripcion')
export class InscripcionController {
  constructor(private readonly inscripcionService: InscripcionService) {}

  @Post()
  @Roles('ADMIN', 'DELEGADO')
  @ApiOperation({ summary: 'US — Inscribir a un participante en una disciplina' })
  create(@Body() dto: CreateInscripcionDto, @CurrentUser() user: AuthenticatedUser) {
    return this.inscripcionService.create(dto, user.id);
  }

  @Patch(':id')
  @Roles('ADMIN', 'DELEGADO')
  @ApiOperation({ summary: 'US-06 — Editar participante (datos básicos, disciplina y/o categoría)' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateInscripcionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.inscripcionService.update(id, dto, user.id);
  }

  @Get()
  findAll() {
    return this.inscripcionService.findAll();
  }

  @Get('persona/:personaId')
  @Roles('ADMIN', 'DELEGADO')
  @ApiOperation({ summary: 'Obtener inscripciones de una persona' })
  findByPersonaId(@Param('personaId', ParseIntPipe) personaId: number) {
    return this.inscripcionService.findByPersonaId(personaId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.inscripcionService.findOne(+id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.inscripcionService.remove(+id);
  }
}
