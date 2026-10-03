import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { TareasController } from './tareas.controller';
import { TareasService } from './tareas.service';
import { TareasTokenGuard } from './tareas-token.guard';

/**
 * Servicio centralizado de tareas automáticas (DT-22). No importa los módulos
 * de dominio: cada uno declara sus tareas con `@Tarea()` y este módulo las
 * descubre al arrancar.
 */
@Module({
  imports: [DiscoveryModule],
  controllers: [TareasController],
  providers: [TareasService, TareasTokenGuard],
})
export class TareasModule {}
