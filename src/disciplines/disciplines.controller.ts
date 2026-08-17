import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DisciplinesService } from './disciplines.service';
import { CreateDisciplineDto } from './dto/create-discipline.dto';
import { UpdateDisciplineDto } from './dto/update-discipline.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';

@ApiTags('disciplines')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('disciplines')
export class DisciplinesController {
  constructor(private readonly disciplinasService: DisciplinesService) {}

  @Post()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Registrar disciplina deportiva' })
  create(@Body() dto: CreateDisciplineDto, @CurrentUser() user: AuthenticatedUser) {
    return this.disciplinasService.create(dto, user.id);
  }

  @Get()
  @Roles('ADMIN', 'COLLABORATOR')
  @ApiOperation({ summary: 'Listar disciplinas deportivas' })
  findAll() {
    return this.disciplinasService.findAll();
  }

  @Get(':id')
  @Roles('ADMIN', 'COLLABORATOR')
  @ApiOperation({ summary: 'Obtener una disciplina por id' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.disciplinasService.findOne(id);
  }

  @Patch(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Editar disciplina' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDisciplineDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.disciplinasService.update(id, dto, user.id);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Dar de baja disciplina (baja lógica)' })
  deactivate(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser) {
    return this.disciplinasService.deactivate(id, user.id);
  }
}
