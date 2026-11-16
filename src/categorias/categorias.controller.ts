import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags, ApiOkResponse } from '@nestjs/swagger';
import { CategoriasService } from './categorias.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ApiErrores } from '../common/swagger/respuestas';

@ApiTags('categorias')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('categorias')
export class CategoriasController {
  constructor(private readonly categoriasService: CategoriasService) {}

  // Disponible para cualquier usuario autenticado porque el 'Hacerme socio'
  // necesita cargar las categorías existentes.
  @Get()
  @ApiOperation({ summary: 'Obtener listado de categorías de socio' })
  @ApiOkResponse({ description: 'Categorías de socio' })
  @ApiErrores({ 401: 'Unauthorized' })
  findAll() {
    return this.categoriasService.findAll();
  }
}
