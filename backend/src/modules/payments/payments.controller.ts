import {
  Controller,
  Post,
  Get,
  Param,
  Headers,
  RawBodyRequest,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { PaymentsService } from './payments.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';

@Controller({ path: 'payments', version: '1' })
export class PaymentsController {
  constructor(
    private readonly service: PaymentsService,
    private readonly config: ConfigService,
  ) {}

  /**
   * GET /api/v1/payments/config
   * Public — expose la clé publishable Stripe + la devise pour que le
   * frontend puisse initialiser Stripe.js (Elements). La clé publishable
   * est conçue pour être publique : elle ne donne aucun accès en écriture
   * au compte Stripe. On indique aussi si la clé semble être un placeholder
   * (utile pour afficher un message clair en bêta).
   */
  @Public()
  @Get('config')
  getConfig() {
    const publishableKey = this.config.get<string>('stripe.publishableKey') ?? '';
    const currency = this.config.get<string>('stripe.currency', 'EUR');
    const isConfigured =
      typeof publishableKey === 'string'
      && publishableKey.startsWith('pk_')
      && !publishableKey.includes('placeholder');
    return { publishableKey, currency, isConfigured };
  }

  /**
   * POST /api/v1/payments/webhook
   * Public — Stripe webhook (raw body required for signature verification)
   * Configured in main.ts with bodyParser.raw() for this path
   */
  @Public()
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    return this.service.handleWebhook(req.rawBody!, signature);
  }

  /**
   * GET /api/v1/payments/appointments/:id
   * Patient only — payment status for an appointment
   */
  @UseGuards(JwtAuthGuard)
  @Get('appointments/:appointmentId')
  getPayment(
    @Param('appointmentId') appointmentId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.getPaymentByAppointment(appointmentId, user.sub);
  }
}
