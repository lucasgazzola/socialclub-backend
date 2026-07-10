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
  ],
  controllers: [AppController],
})
export class AppModule {}
