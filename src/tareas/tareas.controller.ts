import { Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TareasService } from './tareas.service';
import { CABECERA_TAREAS, TareasTokenGuard } from './tareas-token.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';

@ApiTags('tareas')
@Controller('tareas')
export class TareasController {
  constructor(private readonly tareasService: TareasService) {}

  @Get()
  @ApiCookieAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'DT-22 — Tareas automáticas y su última ejecución' })
  listar() {
    return this.tareasService.listar();
  }

  @Get(':nombre/ejecuciones')
  @ApiCookieAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'DT-22 — Últimas ejecuciones de una tarea' })
  ejecuciones(@Param('nombre') nombre: string) {
    return this.tareasService.ejecuciones(nombre);
  }

  @Post(':nombre/ejecutar')
  @HttpCode(200)
  @ApiCookieAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'DT-22 — Ejecutar una tarea a mano (queda auditado)' })
  ejecutarManual(@Param('nombre') nombre: string, @CurrentUser() user: AuthenticatedUser) {
    return this.tareasService.ejecutar(nombre, { origen: 'MANUAL', usuarioId: user.id });
  }

  @Post(':nombre/programada')
  @HttpCode(200)
  @UseGuards(TareasTokenGuard)
  @ApiHeader({ name: CABECERA_TAREAS, required: true })
  @ApiOperation({
    summary:
      'DT-22 — Disparador del workflow programado. Responde la ejecución; el workflow falla si quedó FALLIDA',
  })
  ejecutarProgramada(@Param('nombre') nombre: string) {
    return this.tareasService.ejecutar(nombre, { origen: 'PROGRAMADA' });
  }
}
