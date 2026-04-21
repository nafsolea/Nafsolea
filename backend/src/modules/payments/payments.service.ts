import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { PaymentStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

// Platform fee: 15% of session rate
const PLATFORM_FEE_PERCENT = 0.15;

@Injectable()
export class PaymentsService {
  private readonly stripe: Stripe;
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.stripe = new Stripe(config.get<string>('stripe.secretKey')!, {
      apiVersion: '2024-04-10',
    });
  }

  // ── Create PaymentIntent ─────────────────────────────────────────
  // Called when patient books — frontend uses clientSecret to collect card

  async createPaymentIntent(
    appointmentId: string,
    patientId: string,
    amount: number,
  ) {
    const currency = this.config.get<string>('stripe.currency', 'EUR');
    const amountCents = Math.round(amount * 100);
    const platformFeeCents = Math.round(amountCents * PLATFORM_FEE_PERCENT);

    const intent = await this.stripe.paymentIntents.create({
      amount: amountCents,
      currency: currency.toLowerCase(),
      metadata: { appointmentId, patientId },
      capture_method: 'automatic',
      description: `Nafsoléa — Consultation psychologique (${appointmentId})`,
    });

    const payment = await this.prisma.payment.create({
      data: {
        appointmentId,
        patientId,
        amount,
        currency,
        platformFee: amount * PLATFORM_FEE_PERCENT,
        psychologistPayout: amount * (1 - PLATFORM_FEE_PERCENT),
        stripePaymentIntentId: intent.id,
        stripeClientSecret: intent.client_secret,
        status: PaymentStatus.PENDING,
      },
    });

    return payment;
  }

  // ── Webhook handler ──────────────────────────────────────────────
  // Stripe calls this endpoint — verified with webhook signature

  async handleWebhook(rawBody: Buffer, signature: string) {
    let event: Stripe.Event;

    try {
      event = this.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        this.config.get<string>('stripe.webhookSecret')!,
      );
    } catch (err) {
      throw new BadRequestException(`Webhook signature invalide: ${(err as Error).message}`);
    }

    switch (event.type) {
      case 'payment_intent.succeeded':
        await this.handlePaymentSucceeded(event.data.object as Stripe.PaymentIntent);
        break;
      case 'payment_intent.payment_failed':
        await this.handlePaymentFailed(event.data.object as Stripe.PaymentIntent);
        break;
      case 'charge.refunded':
        await this.handleRefund(event.data.object as Stripe.Charge);
        break;
      default:
        this.logger.debug(`Unhandled Stripe event: ${event.type}`);
    }

    return { received: true };
  }

  private async handlePaymentSucceeded(intent: Stripe.PaymentIntent) {
    const payment = await this.prisma.payment.findUnique({
      where: { stripePaymentIntentId: intent.id },
    });

    if (!payment) {
      this.logger.error(`Payment not found for intent: ${intent.id}`);
      return;
    }

    const charge = intent.latest_charge as Stripe.Charge | null;

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.SUCCEEDED,
        receiptUrl: charge?.receipt_url ?? null,
      },
    });

    // Dynamically import to avoid circular dependency
    const { AppointmentsService } = await import('../appointments/appointments.service');
    // Confirm appointment via event (decoupled via notification)
    // In production use Bull queue for reliability:
    this.logger.log(`Payment succeeded for appointment: ${payment.appointmentId}`);
  }

  private async handlePaymentFailed(intent: Stripe.PaymentIntent) {
    const payment = await this.prisma.payment.findUnique({
      where: { stripePaymentIntentId: intent.id },
    });

    if (payment) {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.FAILED },
      });

      await this.prisma.appointment.update({
        where: { id: payment.appointmentId },
        data: { status: 'EXPIRED' },
      });
    }
  }

  private async handleRefund(charge: Stripe.Charge) {
    if (!charge.payment_intent) return;

    const payment = await this.prisma.payment.findUnique({
      where: { stripePaymentIntentId: charge.payment_intent as string },
    });

    if (!payment) return;

    const refundedAmount = charge.amount_refunded / 100;
    const isFullRefund = refundedAmount >= Number(payment.amount);

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: isFullRefund ? PaymentStatus.REFUNDED : PaymentStatus.PARTIALLY_REFUNDED,
        refundedAmount,
        refundedAt: new Date(),
      },
    });
  }

  // ── Issue refund ─────────────────────────────────────────────────

  async refund(paymentId: string, amount: number, reason: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException('Paiement introuvable');
    if (payment.status !== PaymentStatus.SUCCEEDED) {
      throw new BadRequestException('Remboursement impossible');
    }

    const amountCents = Math.round(amount * 100);

    const refund = await this.stripe.refunds.create({
      payment_intent: payment.stripePaymentIntentId!,
      amount: amountCents,
      reason: 'requested_by_customer',
    });

    await this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        stripeRefundId: refund.id,
        refundedAmount: amount,
        refundReason: reason,
        refundedAt: new Date(),
        status: amount >= Number(payment.amount)
          ? PaymentStatus.REFUNDED
          : PaymentStatus.PARTIALLY_REFUNDED,
      },
    });

    return { refundId: refund.id, amount, status: 'refunded' };
  }

  // ── Get payment details (patient only) ───────────────────────────

  async getPaymentByAppointment(appointmentId: string, patientUserId: string) {
    const payment = await this.prisma.payment.findFirst({
      where: {
        appointmentId,
        patient: { userId: patientUserId },
      },
      select: {
        id: true,
        amount: true,
        currency: true,
        status: true,
        refundedAmount: true,
        refundedAt: true,
        receiptUrl: true,
        createdAt: true,
      },
    });

    if (!payment) throw new NotFoundException('Paiement introuvable');
    return payment;
  }
}
