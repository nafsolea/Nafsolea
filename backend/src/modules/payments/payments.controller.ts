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
import { Request } from 'express';
import { PaymentsService } from './payments.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';

@Controller({ path: 'payments', version: '1' })
export class PaymentsController {
  constructor(private readonly service: PaymentsService) {}

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
