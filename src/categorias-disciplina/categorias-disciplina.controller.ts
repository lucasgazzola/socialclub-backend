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
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { CategoriasDisciplinaService } from './categorias-disciplina.service';
import { CreateCategoriaDisciplinaDto } from './dto/create-categoria-disciplina.dto';
import { UpdateCategoriaDisciplinaDto } from './dto/update-categoria-disciplina.dto';
import { FindCategoriasDisciplinaQueryDto } from './dto/find-categorias-disciplina-query.dto';

@ApiTags('categorias-disciplina')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('disciplinas/:disciplinaId/categorias')
export class CategoriasDisciplinaController {
  constructor(private readonly categoriasService: CategoriasDisciplinaService) {}

  @Post()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Agregar categoría a una disciplina (US-48)' })
  create(
    @Param('disciplinaId', ParseIntPipe) disciplinaId: number,
    @Body() dto: CreateCategoriaDisciplinaDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.categoriasService.create(disciplinaId, dto, user.id);
  }

  @Get()
  @Roles('ADMIN', 'COLABORADOR', 'DELEGADO')
  @ApiOperation({ summary: 'Listar categorías de una disciplina (US-51)' })
  findAll(
    @Param('disciplinaId', ParseIntPipe) disciplinaId: number,
    @Query() query: FindCategoriasDisciplinaQueryDto,
  ) {
    return this.categoriasService.findAll(disciplinaId, query);
  }

  @Get(':id')
  @Roles('ADMIN', 'COLABORADOR', 'DELEGADO')
  @ApiOperation({ summary: 'Obtener una categoría de la disciplina' })
  findOne(
    @Param('disciplinaId', ParseIntPipe) disciplinaId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.categoriasService.findOne(disciplinaId, id);
  }

  @Patch(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Editar categoría (US-49)' })
  update(
    @Param('disciplinaId', ParseIntPipe) disciplinaId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCategoriaDisciplinaDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.categoriasService.update(disciplinaId, id, dto, user.id);
  }

  @Patch(':id/reactivar')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Reactivar categoría' })
  reactivate(
    @Param('disciplinaId', ParseIntPipe) disciplinaId: number,
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.categoriasService.reactivate(disciplinaId, id, user.id);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Dar de baja categoría (baja lógica, US-50)' })
  deactivate(
    @Param('disciplinaId', ParseIntPipe) disciplinaId: number,
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.categoriasService.deactivate(disciplinaId, id, user.id);
  }
}
