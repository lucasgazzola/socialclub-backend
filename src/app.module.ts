import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { validateEnv } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';
import { AuditoriaModule } from './auditoria/auditoria.module';
import { AuthModule } from './auth/auth.module';
import { UsuariosModule } from './usuarios/usuarios.module';
import { SociosModule } from './socios/socios.module';
import { CategoriasModule } from './categorias/categorias.module';
import { EventosModule } from './eventos/eventos.module';
import { EntradasModule } from './entradas/entradas.module';
import { DisciplinasModule } from './disciplinas/disciplinas.module';
import { CategoriasDisciplinaModule } from './categorias-disciplina/categorias-disciplina.module';
import { CuotasModule } from './cuotas/cuotas.module';
import { CuotaSocialModule } from './cuota-social/cuota-social.module';
import { PersonasModule } from './personas/personas.module';
import { InscripcionModule } from './inscripcion/inscripcion.module';
import { DocumentacionModule } from './documentacion/documentacion.module';
import { PagosModule } from './pagos/pagos.module';
import { AlertasModule } from './alertas/alertas.module';

@Module({
  imports: [
    // Configuración global validada al arranque
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    PrismaModule,
    AuditoriaModule,
    // Módulos de dominio (un módulo por área funcional → escalabilidad modular)
    AuthModule,
    UsuariosModule,
    SociosModule,
    CategoriasModule,
    EventosModule,
    EntradasModule,
    DisciplinasModule,
    CategoriasDisciplinaModule,
    CuotasModule,
    CuotaSocialModule,
    PersonasModule,
    InscripcionModule,
    DocumentacionModule,
    PagosModule,
    AlertasModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
