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
import { CuotasService } from './cuotas.service';
import { ConfigurarCuotaDto } from './dto/configurar-cuota.dto';
import { ActualizarCuotaDto } from './dto/actualizar-cuota.dto';
import { FindCuotasQueryDto } from './dto/find-cuotas-query.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';

@ApiTags('cuotas')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('cuotas')
export class CuotasController {
  constructor(private readonly cuotasService: CuotasService) {}

  @Post()
  @Roles('ADMIN')
  @ApiOperation({
    summary:
      'Configurar cuota deportiva por disciplina y categoría (aplica desde el período siguiente)',
  })
  configurar(@Body() dto: ConfigurarCuotaDto, @CurrentUser() user: AuthenticatedUser) {
    return this.cuotasService.configurar(dto, user.id);
  }

  @Get()
  @Roles('ADMIN', 'COLABORADOR')
  @ApiOperation({
    summary: 'Listar configuraciones de cuota (filtros por disciplina, categoría y período)',
  })
  findAll(@Query() query: FindCuotasQueryDto) {
    return this.cuotasService.findAll(query);
  }

  @Get(':id')
  @Roles('ADMIN', 'COLABORADOR')
  @ApiOperation({ summary: 'Obtener una configuración de cuota por id' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.cuotasService.findOne(id);
  }

  @Patch(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Actualizar monto o estado de una configuración de cuota' })
  actualizar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ActualizarCuotaDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.cuotasService.actualizar(id, dto, user.id);
  }
}
