import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FeesService } from './fees.service';
import { ConfigureFeeDto } from './dto/configure-fee.dto';
import { UpdateFeeDto } from './dto/update-fee.dto';
import { FindFeesQueryDto } from './dto/find-fees-query.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';

@ApiTags('fees')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('fees')
export class FeesController {
  constructor(private readonly cuotasService: FeesService) {}

  @Post()
  @Roles('ADMIN')
  @ApiOperation({
    summary:
      'Configurar cuota deportiva por disciplina y categoría (aplica desde el período siguiente)',
  })
  configurar(@Body() dto: ConfigureFeeDto, @CurrentUser() user: AuthenticatedUser) {
    return this.cuotasService.configurar(dto, user.id);
  }

  @Get()
  @Roles('ADMIN', 'COLLABORATOR')
  @ApiOperation({
    summary: 'Listar configuraciones de cuota (filtros por disciplina, categoría y período)',
  })
  findAll(@Query() query: FindFeesQueryDto) {
    return this.cuotasService.findAll(query);
  }

  @Get(':id')
  @Roles('ADMIN', 'COLLABORATOR')
  @ApiOperation({ summary: 'Obtener una configuración de cuota por id' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.cuotasService.findOne(id);
  }

  @Patch(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Actualizar monto o estado de una configuración de cuota' })
  actualizar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateFeeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.cuotasService.actualizar(id, dto, user.id);
  }
}
