import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';

// Actions to audit (method + route pattern)
const AUDITED_ROUTES: Array<{ method: string; pattern: RegExp; action: string }> = [
  { method: 'POST',   pattern: /\/auth\/login/,         action: 'LOGIN' },
  { method: 'POST',   pattern: /\/auth\/logout/,        action: 'LOGOUT' },
  { method: 'POST',   pattern: /\/appointments/,        action: 'BOOK_APPOINTMENT' },
  { method: 'DELETE', pattern: /\/appointments/,        action: 'CANCEL_APPOINTMENT' },
  { method: 'GET',    pattern: /\/consultation-notes/,  action: 'VIEW_CONSULTATION_NOTE' },
  { method: 'POST',   pattern: /\/payments/,            action: 'INITIATE_PAYMENT' },
];

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const matchedRoute = AUDITED_ROUTES.find(
      (r) => r.method === req.method && r.pattern.test(req.url),
    );

    if (!matchedRoute) return next.handle();

    const userId = (req.user as { id?: string } | undefined)?.id;

    return next.handle().pipe(
      tap(() => {
        this.prisma.auditLog.create({
          data: {
            userId,
            action: matchedRoute.action,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            metadata: { url: req.url, method: req.method },
          },
        }).catch(() => { /* non-blocking */ });
      }),
    );
  }
}
