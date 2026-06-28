import { Global, Module } from '@nestjs/common';
import { AuditoriaService } from './auditoria.service';

/**
 * Módulo global: cualquier módulo de dominio puede inyectar AuditoriaService
 * para registrar sus operaciones sin importarlo explícitamente.
 */
@Global()
@Module({
  providers: [AuditoriaService],
  exports: [AuditoriaService],
})
export class AuditoriaModule {}
