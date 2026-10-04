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
import {
  ApiCookieAuth,
  ApiOperation,
  ApiTags,
  ApiCreatedResponse,
  ApiOkResponse,
} from '@nestjs/swagger';
import { CuotaSocialService } from './cuota-social.service';
import { ConfigurarCuotaSocialDto } from './dto/configurar-cuota-social.dto';
import { ActualizarCuotaSocialDto } from './dto/actualizar-cuota-social.dto';
import { FindCuotaSocialQueryDto } from './dto/find-cuota-social-query.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { ApiErrores, VALIDACION } from '../common/swagger/respuestas';

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
  @ApiCreatedResponse({ description: 'Cuota social configurada para el período indicado' })
  @ApiErrores({
    400: [
      VALIDACION,
      'El período … no es válido: los cambios de cuota aplican a partir del período siguiente (…)',
    ],
    401: 'Unauthorized',
    403: 'No tenés permisos suficientes para esta operación',
    404: 'Categoría de socio no encontrada',
  })
  configurar(@Body() dto: ConfigurarCuotaSocialDto, @CurrentUser() user: AuthenticatedUser) {
    return this.cuotaSocialService.configurar(dto, user.id);
  }

  @Get('vigente')
  @Roles('ADMIN', 'COLABORADOR')
  @ApiOperation({ summary: 'Listar cuotas vigentes del mes actual (una por categoría)' })
  @ApiOkResponse({ description: 'Cuota vigente de cada categoría' })
  @ApiErrores({ 401: 'Unauthorized', 403: 'No tenés permisos suficientes para esta operación' })
  getVigentes() {
    return this.cuotaSocialService.getVigentes();
  }

  @Get('vigente/:categoriaId')
  @Roles('ADMIN', 'COLABORADOR')
  @ApiOperation({ summary: 'Obtener cuota vigente de una categoría para el mes actual' })
  @ApiOkResponse({ description: 'Cuota vigente de la categoría (null si no hay)' })
  @ApiErrores({
    400: VALIDACION,
    401: 'Unauthorized',
    403: 'No tenés permisos suficientes para esta operación',
  })
  getVigente(@Param('categoriaId', ParseIntPipe) categoriaId: number) {
    return this.cuotaSocialService.getVigente(categoriaId);
  }

  @Post('sincronizar')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Sincronizar flags activo según vigencia por fecha (rotación mensual)' })
  @ApiCreatedResponse({ description: 'Cantidad de configuraciones actualizadas' })
  @ApiErrores({ 401: 'Unauthorized', 403: 'No tenés permisos suficientes para esta operación' })
  sincronizar() {
    return this.cuotaSocialService.sincronizarVigentes();
  }

  @Get()
  @Roles('ADMIN', 'COLABORADOR')
  @ApiOperation({
    summary: 'Listar configuraciones de cuota social (filtros por categoría y período)',
  })
  @ApiOkResponse({ description: 'Configuraciones de cuota social' })
  @ApiErrores({
    400: VALIDACION,
    401: 'Unauthorized',
    403: 'No tenés permisos suficientes para esta operación',
  })
  findAll(@Query() query: FindCuotaSocialQueryDto) {
    return this.cuotaSocialService.findAll(query);
  }

  @Get(':id')
  @Roles('ADMIN', 'COLABORADOR')
  @ApiOperation({ summary: 'Obtener una configuración de cuota social por id' })
  @ApiOkResponse({ description: 'Configuración de cuota social' })
  @ApiErrores({
    400: VALIDACION,
    401: 'Unauthorized',
    403: 'No tenés permisos suficientes para esta operación',
    404: 'Configuración de cuota social no encontrada',
  })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.cuotaSocialService.findOne(id);
  }

  @Patch(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Actualizar monto o estado de una configuración de cuota social' })
  @ApiOkResponse({ description: 'Configuración actualizada' })
  @ApiErrores({
    400: VALIDACION,
    401: 'Unauthorized',
    403: 'No tenés permisos suficientes para esta operación',
    404: 'Configuración de cuota social no encontrada',
  })
  actualizar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ActualizarCuotaSocialDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.cuotaSocialService.actualizar(id, dto, user.id);
  }
}
