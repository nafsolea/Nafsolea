import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import compression from 'compression';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { AuditLogInterceptor } from './common/interceptors/audit-log.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3000);
  const frontendUrl = configService.get<string>('FRONTEND_URL', 'http://localhost:8080');

  // ── Security headers ─────────────────────────────────────────────
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false, // needed for video embeds
  }));

  // ── Compression ──────────────────────────────────────────────────
  app.use(compression());

  // ── CORS ─────────────────────────────────────────────────────────
  // En bêta on autorise aussi les aperçus Netlify et l'accès local direct.
  app.enableCors({
    origin: [
      frontendUrl,
      /\.nafsolea\.com$/,
      /\.netlify\.app$/,       // aperçus de déploiement Netlify
      'http://localhost:8080',
      'http://localhost:5500',
      'http://127.0.0.1:5500',
    ],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: true,
  });

  // ── Global prefix & versioning ───────────────────────────────────
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  // ── Global pipes (input validation + transformation) ─────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,          // strip unknown properties
      forbidNonWhitelisted: true,
      transform: true,          // auto-cast primitives
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // ── Global filters & interceptors ────────────────────────────────
  app.useGlobalFilters(new HttpExceptionFilter());

  // ── Stripe webhook: raw body needed for signature verification ───
  // Express raw body middleware is configured in AppModule

  await app.listen(port);
  console.log(`🚀 Nafsoléa API running on http://localhost:${port}/api/v1`);
}

bootstrap();
