import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { validateEnv } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { MembersModule } from './members/members.module';
import { CategoriesModule } from './categories/categories.module';
import { EventsModule } from './events/events.module';
import { TicketsModule } from './tickets/tickets.module';
import { DisciplinesModule } from './disciplines/disciplines.module';
import { FeesModule } from './fees/fees.module';

@Module({
  imports: [
    // Configuración global validada al arranque
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    PrismaModule,
    AuditModule,
    // Módulos de dominio (un módulo por área funcional → escalabilidad modular)
    AuthModule,
    UsersModule,
    MembersModule,
    CategoriesModule,
    EventsModule,
    TicketsModule,
    DisciplinesModule,
    FeesModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
