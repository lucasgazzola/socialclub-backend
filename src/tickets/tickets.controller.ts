import { Body, Controller, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TicketsService } from './tickets.service';
import { CreateTicketsDto } from './dto/create-tickets.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';

@ApiTags('tickets')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('tickets')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Post()
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Generar N entradas únicas con token UUID para un evento',
  })
  createMany(@Body() dto: CreateTicketsDto, @CurrentUser() user: AuthenticatedUser) {
    return this.ticketsService.createMany(dto, user.id);
  }

  @Get('event/:eventId')
  @Roles('ADMIN', 'COLLABORATOR')
  @ApiOperation({ summary: 'Listar entradas de un evento' })
  listByEvent(@Param('eventId', ParseIntPipe) eventId: number) {
    return this.ticketsService.listByEvent(eventId);
  }
}
