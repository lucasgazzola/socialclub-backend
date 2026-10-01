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
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DisciplinasService } from './disciplinas.service';
import { CreateDisciplinaDto } from './dto/create-disciplina.dto';
import { UpdateDisciplinaDto } from './dto/update-disciplina.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { FindDisciplinasQueryDto } from './dto/find-disciplinas-query.dto';

@ApiTags('disciplinas')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('disciplinas')
export class DisciplinasController {
  constructor(private readonly disciplinasService: DisciplinasService) {}

  @Post()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Registrar disciplina deportiva' })
  create(@Body() dto: CreateDisciplinaDto, @CurrentUser() user: AuthenticatedUser) {
    return this.disciplinasService.create(dto, user.id);
  }

  @Get()
  @Roles('ADMIN', 'COLABORADOR')
  @ApiOperation({ summary: 'Listar disciplinas deportivas' })
  findAll(@Query() query: FindDisciplinasQueryDto) {
    return this.disciplinasService.findAll(query);
  }

  @Get(':id')
  @Roles('ADMIN', 'COLABORADOR')
  @ApiOperation({ summary: 'Obtener una disciplina por id' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.disciplinasService.findOne(id);
  }

  @Patch(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Editar disciplina' })
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
  reactivate(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser) {
    return this.disciplinasService.reactivate(id, user.id);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Dar de baja disciplina (baja lógica)' })
  deactivate(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser) {
    return this.disciplinasService.deactivate(id, user.id);
  }
}
