import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { AuditService } from './audit.service';
import { FindAuditLogsQueryDto } from './dto/find-audit-logs-query.dto';

@ApiTags('audit')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('audit')
export class AuditController {
  constructor(private readonly auditoriaService: AuditService) {}

  @Get()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'US-32 — Consultar log de operaciones' })
  findAll(@Query() query: FindAuditLogsQueryDto) {
    return this.auditoriaService.listAll(query);
  }
}
