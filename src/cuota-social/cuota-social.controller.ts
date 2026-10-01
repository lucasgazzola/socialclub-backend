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
import { CuotaSocialService } from './cuota-social.service';
import { ConfigurarCuotaSocialDto } from './dto/configurar-cuota-social.dto';
import { ActualizarCuotaSocialDto } from './dto/actualizar-cuota-social.dto';
import { FindCuotaSocialQueryDto } from './dto/find-cuota-social-query.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';

@ApiTags('cuota-social')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('cuota-social')
export class CuotaSocialController {
  constructor(private readonly cuotaSocialService: CuotaSocialService) {}

  @Post()
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Configurar cuota social por categoría (aplica desde el período siguiente)',
  })
  configurar(@Body() dto: ConfigurarCuotaSocialDto, @CurrentUser() user: AuthenticatedUser) {
    return this.cuotaSocialService.configurar(dto, user.id);
  }

  @Get('vigente')
  @Roles('ADMIN', 'COLABORADOR')
  @ApiOperation({ summary: 'Listar cuotas vigentes del mes actual (una por categoría)' })
  getVigentes() {
    return this.cuotaSocialService.getVigentes();
  }

  @Get('vigente/:categoriaId')
  @Roles('ADMIN', 'COLABORADOR')
  @ApiOperation({ summary: 'Obtener cuota vigente de una categoría para el mes actual' })
  getVigente(@Param('categoriaId', ParseIntPipe) categoriaId: number) {
    return this.cuotaSocialService.getVigente(categoriaId);
  }

  @Post('sincronizar')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Sincronizar flags activo según vigencia por fecha (rotación mensual)' })
  sincronizar() {
    return this.cuotaSocialService.sincronizarVigentes();
  }

  @Get()
  @Roles('ADMIN', 'COLABORADOR')
  @ApiOperation({
    summary: 'Listar configuraciones de cuota social (filtros por categoría y período)',
  })
  findAll(@Query() query: FindCuotaSocialQueryDto) {
    return this.cuotaSocialService.findAll(query);
  }

  @Get(':id')
  @Roles('ADMIN', 'COLABORADOR')
  @ApiOperation({ summary: 'Obtener una configuración de cuota social por id' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.cuotaSocialService.findOne(id);
  }

  @Patch(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Actualizar monto o estado de una configuración de cuota social' })
  actualizar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ActualizarCuotaSocialDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.cuotaSocialService.actualizar(id, dto, user.id);
  }
}
