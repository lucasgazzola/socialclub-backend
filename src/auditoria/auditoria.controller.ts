import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { AuditoriaService } from './auditoria.service';
import { FindAuditoriaQueryDto } from './dto/find-auditoria-query.dto';

@ApiTags('auditoria')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('auditoria')
export class AuditoriaController {
  constructor(private readonly auditoriaService: AuditoriaService) {}

  @Get()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'US-32 — Consultar log de operaciones' })
  findAll(@Query() query: FindAuditoriaQueryDto) {
    return this.auditoriaService.listarTodos(query);
  }
}
