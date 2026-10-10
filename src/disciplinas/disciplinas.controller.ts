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
import { DisciplinasService } from './disciplinas.service';
import { CreateDisciplinaDto } from './dto/create-disciplina.dto';
import { UpdateDisciplinaDto } from './dto/update-disciplina.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { FindDisciplinasQueryDto } from './dto/find-disciplinas-query.dto';
import { ApiErrores, VALIDACION } from '../common/swagger/respuestas';

@ApiTags('disciplinas')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('disciplinas')
export class DisciplinasController {
  constructor(private readonly disciplinasService: DisciplinasService) {}

  @Post()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Registrar disciplina deportiva' })
  @ApiCreatedResponse({ description: 'Disciplina creada' })
  @ApiErrores({
    400: [VALIDACION, 'La edad máxima debe ser mayor que la edad mínima'],
    401: 'Unauthorized',
    403: 'No tenés permisos suficientes para esta operación',
    404: 'Disciplina no encontrada',
    409: 'Ya existe una disciplina con ese nombre',
  })
  create(@Body() dto: CreateDisciplinaDto, @CurrentUser() user: AuthenticatedUser) {
    return this.disciplinasService.create(dto, user.id);
  }

  @Get()
  // El DELEGADO inscribe participantes (US-05): necesita elegir la disciplina.
  @Roles('ADMIN', 'COLABORADOR', 'DELEGADO')
  @ApiOperation({ summary: 'Listar disciplinas deportivas' })
  @ApiOkResponse({ description: 'Página de disciplinas' })
  @ApiErrores({
    400: VALIDACION,
    401: 'Unauthorized',
    403: 'No tenés permisos suficientes para esta operación',
  })
  findAll(@Query() query: FindDisciplinasQueryDto) {
    return this.disciplinasService.findAll(query);
  }

  @Get(':id')
  @Roles('ADMIN', 'COLABORADOR', 'DELEGADO')
  @ApiOperation({ summary: 'Obtener una disciplina por id' })
  @ApiOkResponse({ description: 'Disciplina con sus categorías y requisitos' })
  @ApiErrores({
    400: VALIDACION,
    401: 'Unauthorized',
    403: 'No tenés permisos suficientes para esta operación',
    404: 'Disciplina no encontrada',
  })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.disciplinasService.findOne(id);
  }

  @Patch(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Editar disciplina' })
  @ApiOkResponse({ description: 'Disciplina actualizada' })
  @ApiErrores({
    400: [VALIDACION, 'La edad máxima debe ser mayor que la edad mínima'],
    401: 'Unauthorized',
    403: 'No tenés permisos suficientes para esta operación',
    404: 'Disciplina no encontrada',
    409: 'Ya existe una disciplina con ese nombre',
  })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDisciplinaDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.disciplinasService.update(id, dto, user.id);
  }

  @Patch(':id/reactivar')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Reactivar disciplina (restaurar estado activo)' })
  @ApiOkResponse({ description: 'Disciplina reactivada' })
  @ApiErrores({
    400: VALIDACION,
    401: 'Unauthorized',
    403: 'No tenés permisos suficientes para esta operación',
    404: 'Disciplina no encontrada',
    409: 'La disciplina ya se encuentra activa',
  })
  reactivate(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser) {
    return this.disciplinasService.reactivate(id, user.id);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Dar de baja disciplina (baja lógica)' })
  @ApiOkResponse({ description: 'Disciplina dada de baja' })
  @ApiErrores({
    400: VALIDACION,
    401: 'Unauthorized',
    403: 'No tenés permisos suficientes para esta operación',
    404: 'Disciplina no encontrada',
    409: 'La disciplina ya se encuentra inactiva',
  })
  deactivate(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser) {
    return this.disciplinasService.deactivate(id, user.id);
  }
}
