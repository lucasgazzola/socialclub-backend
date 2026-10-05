import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags, ApiOkResponse } from '@nestjs/swagger';
import { AlertasService } from './alertas.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { ApiErrores } from '../common/swagger/respuestas';
import { AlertaDocumentacionDto } from './dto/alerta-documentacion.dto';

/**
 * US-26 — Alertas de documentación. El aviso por email lo dispara la tarea
 * automática `vencimientos-documentacion` (DT-22), no este controller.
 */
@ApiTags('alertas')
@Controller('alertas')
export class AlertasController {
  constructor(private readonly alertasService: AlertasService) {}

  @Get('documentacion')
  @ApiCookieAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'DELEGADO')
  @ApiOperation({
    summary:
      'US-26 — Alertas de documentación por vencer, vencida o pendiente de presentación (el delegado ve solo sus disciplinas)',
  })
  @ApiOkResponse({
    description:
      'Alertas de documentación ordenadas por urgencia, solo de las disciplinas visibles',
    type: [AlertaDocumentacionDto],
  })
  @ApiErrores({ 401: 'Unauthorized', 403: 'No tenés permisos suficientes para esta operación' })
  async documentacion(@CurrentUser() usuario: AuthenticatedUser) {
    // DT-42: el delegado ve solo las disciplinas que tiene a cargo.
    const disciplinas = await this.alertasService.disciplinasVisibles(usuario);
    return this.alertasService.listar(new Date(), disciplinas);
  }
}
