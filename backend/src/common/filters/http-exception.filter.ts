import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Une erreur interne est survenue';
    let errors: unknown = undefined;
    let debugInfo: string | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();

      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const resObj = res as Record<string, unknown>;
        message = (resObj.message as string) || message;
        // class-validator returns array of errors
        if (Array.isArray(resObj.message)) {
          errors = resObj.message;
          message = 'Données invalides';
        }
      }
    } else if (exception instanceof Error) {
      // Non-HTTP exceptions (Prisma errors, TypeError, etc.)
      // On capture le message + le code Prisma s'il y en a un pour faciliter le debug
      const err = exception as Error & { code?: string; meta?: unknown };
      debugInfo = err.code ? `[${err.code}] ${err.message}` : err.message;
    } else {
      debugInfo = String(exception);
    }

    // Log 5xx errors
    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} → ${status} | ${debugInfo ?? message}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(status).json({
      statusCode: status,
      message,
      ...(errors ? { errors } : {}),
      // En cas de 500 : on expose le message d'erreur brut pour faciliter
      // le debug en bêta. À retirer en prod stable si on ne veut pas leak d'info.
      ...(status >= 500 && debugInfo ? { debug: debugInfo } : {}),
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
