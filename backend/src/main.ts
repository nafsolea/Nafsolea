import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import * as compression from 'compression';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { AuditLogInterceptor } from './common/interceptors/audit-log.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  // ── Body parser: bump limit pour accepter les avatars base64 ─────
  // Default Express = 100kb, on monte à 5mb pour gérer :
  //   - avatars base64 (jusqu'à 1mb fichier → ~1.4mb base64)
  //   - images de couverture d'articles (jusqu'à 2mb fichier → ~2.7mb base64)
  //   - contenu HTML d'articles + métadonnées
  app.use(json({ limit: '5mb' }));
  app.use(urlencoded({ limit: '5mb', extended: true }));

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

  // Bind explicite sur 0.0.0.0 pour les conteneurs Docker (Render, Fly, etc.)
  await app.listen(port, '0.0.0.0');
  console.log(`🚀 Nafsoléa API running on port ${port} (prefix /api/v1)`);
}

bootstrap().catch((err) => {
  // Render coupe le process sans afficher l'erreur si on ne la log pas explicitement.
  console.error('❌ Bootstrap failed:', err);
  process.exit(1);
});
