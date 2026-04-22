import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';

import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { PsychologistsModule } from './modules/psychologists/psychologists.module';
import { AppointmentsModule } from './modules/appointments/appointments.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { VideoModule } from './modules/video/video.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AdminModule } from './modules/admin/admin.module';
import { NotesModule } from './modules/notes/notes.module';
import { ArticlesModule } from './modules/articles/articles.module';
import { NewsletterModule } from './modules/newsletter/newsletter.module';
import configuration from './config/configuration';

@Module({
  imports: [
    // ── Config ────────────────────────────────────────────────────
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: '.env',
    }),

    // ── Rate limiting ──────────────────────────────────────────────
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ([{
        ttl: config.get('THROTTLE_TTL', 60) * 1000,
        limit: config.get('THROTTLE_LIMIT', 100),
      }]),
    }),

    // ── Cron jobs ─────────────────────────────────────────────────
    // Bull/Redis désactivé pour la bêta — les rappels passent par les Cron NestJS.
    // À réactiver en prod avec Upstash + TLS pour les jobs longs.
    ScheduleModule.forRoot(),

    // ── App modules ───────────────────────────────────────────────
    PrismaModule,
    AuthModule,
    UsersModule,
    PsychologistsModule,
    AppointmentsModule,
    PaymentsModule,
    VideoModule,
    NotificationsModule,
    AdminModule,
    NotesModule,
    ArticlesModule,
    NewsletterModule,
  ],
  providers: [
    // Apply rate limiting globally
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
