import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AlertasService } from './alertas.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

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
    summary: 'US-26 — Alertas de documentación por vencer, vencida o pendiente de presentación',
  })
  documentacion() {
    return this.alertasService.listar();
  }
}
