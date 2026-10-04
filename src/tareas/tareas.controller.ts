import { Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiHeader, ApiOperation, ApiTags, ApiOkResponse } from '@nestjs/swagger';
import { TareasService } from './tareas.service';
import { CABECERA_TAREAS, TareasTokenGuard } from './tareas-token.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { ApiErrores } from '../common/swagger/respuestas';

@ApiTags('tareas')
@Controller('tareas')
export class TareasController {
  constructor(private readonly tareasService: TareasService) {}

  @Get()
  @ApiCookieAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'DT-22 — Tareas automáticas y su última ejecución' })
  @ApiOkResponse({ description: 'Tareas registradas con su última ejecución' })
  @ApiErrores({ 401: 'Unauthorized', 403: 'No tenés permisos suficientes para esta operación' })
  listar() {
    return this.tareasService.listar();
  }

  @Get(':nombre/ejecuciones')
  @ApiCookieAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'DT-22 — Últimas ejecuciones de una tarea' })
  @ApiOkResponse({ description: 'Últimas ejecuciones de la tarea' })
  @ApiErrores({
    401: 'Unauthorized',
    403: 'No tenés permisos suficientes para esta operación',
    404: 'No existe la tarea automática «…»',
  })
  ejecuciones(@Param('nombre') nombre: string) {
    return this.tareasService.ejecuciones(nombre);
  }

  @Post(':nombre/ejecutar')
  @HttpCode(200)
  @ApiCookieAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'DT-22 — Ejecutar una tarea a mano (queda auditado)' })
  @ApiOkResponse({ description: 'Ejecución registrada (exitosa o fallida)' })
  @ApiErrores({
    401: 'Unauthorized',
    403: 'No tenés permisos suficientes para esta operación',
    404: 'No existe la tarea automática «…»',
  })
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
  @ApiOkResponse({ description: 'Ejecución registrada (exitosa o fallida)' })
  @ApiErrores({
    401: 'Token de tareas automáticas inválido',
    403: 'La ejecución programada de tareas no está configurada',
    404: 'No existe la tarea automática «…»',
  })
  ejecutarProgramada(@Param('nombre') nombre: string) {
    return this.tareasService.ejecutar(nombre, { origen: 'PROGRAMADA' });
  }
}
