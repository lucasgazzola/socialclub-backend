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
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { Roles } from '../common/decorators/roles.decorator';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RolesGuard } from '../common/guards/roles.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

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
  create(@Body() dto: CreateInscripcionDto, @CurrentUser() user: AuthenticatedUser) {
    return this.inscripcionService.create(dto, user.id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'US-06 — Editar participante (datos básicos, disciplina y/o categoría)',
  })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateInscripcionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.inscripcionService.update(id, dto, user.id);
  }

  @Get()
  @Roles('ADMIN', 'COLABORADOR')
  @ApiOperation({
    summary: 'US-08 — Buscar y filtrar participantes (nombre, disciplina, estado)',
  })
  findAll(@Query() query: FindParticipantesQueryDto) {
    return this.inscripcionService.findAll(query);
  }

  @Get('persona/:personaId')
  @ApiOperation({ summary: 'Obtener inscripciones vigentes de una persona' })
  findByPersonaId(@Param('personaId', ParseIntPipe) personaId: number) {
    return this.inscripcionService.findByPersonaId(personaId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener una inscripción por id' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.inscripcionService.findOne(id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Dar de baja una inscripción (baja lógica, auditada)' })
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser) {
    return this.inscripcionService.remove(id, user.id);
  }
}
