import { Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AlertasService } from './alertas.service';
import { CABECERA_CRON, CronTokenGuard } from './cron-token.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

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

  @Post('documentacion/notificar')
  @HttpCode(200)
  @UseGuards(CronTokenGuard)
  @ApiHeader({ name: CABECERA_CRON, required: true })
  @ApiOperation({
    summary: 'US-26 — Avisa por email a los delegados las alertas nuevas (tarea programada)',
  })
  notificar() {
    return this.alertasService.notificar();
  }
}
