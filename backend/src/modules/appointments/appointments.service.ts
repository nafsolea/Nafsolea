import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { UserRole, AppointmentStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PaymentsService } from '../payments/payments.service';
import { NotificationsService } from '../notifications/notifications.service';
import { VideoService } from '../video/video.service';

// Slot hold duration before payment must complete
const PAYMENT_HOLD_MINUTES = 15;

@Injectable()
export class AppointmentsService {
  private readonly logger = new Logger(AppointmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentsService,
    private readonly notifications: NotificationsService,
    private readonly video: VideoService,
  ) {}

  // ── Book appointment ─────────────────────────────────────────────
  // Creates appointment in PENDING_PAYMENT state + Stripe PaymentIntent.
  // Slot is reserved for 15 min while patient completes payment.

  async book(patientUserId: string, psychologistId: string, scheduledAt: Date, notes?: string) {
    const patient = await this.prisma.patient.findUnique({ where: { userId: patientUserId } });
    if (!patient) throw new NotFoundException('Profil patient introuvable');

    const psy = await this.prisma.psychologist.findFirst({
      where: { id: psychologistId, status: 'APPROVED' },
    });
    if (!psy) throw new NotFoundException('Psychologue introuvable');

    // ── Anti-double-booking: database-level lock ──────────────────
    const appointment = await this.prisma.$transaction(async (tx) => {
      const slotEnd = new Date(scheduledAt.getTime() + psy.sessionDuration * 60_000);

      const conflict = await tx.appointment.findFirst({
        where: {
          psychologistId,
          status: { in: ['PENDING_PAYMENT', 'CONFIRMED', 'IN_PROGRESS'] },
          scheduledAt: { lt: slotEnd },
          // Overlap: existing.start < newEnd AND existing.start + duration > newStart
          AND: [{
            scheduledAt: {
              gte: new Date(scheduledAt.getTime() - psy.sessionDuration * 60_000),
            },
          }],
        },
      });

      if (conflict) {
        throw new ConflictException('Ce créneau est déjà réservé. Choisissez un autre horaire.');
      }

      // Also verify psychologist has availability for this slot
      await this.verifyAvailability(tx, psy, scheduledAt);

      const paymentExpireAt = new Date(Date.now() + PAYMENT_HOLD_MINUTES * 60_000);

      return tx.appointment.create({
        data: {
          patientId: patient.id,
          psychologistId,
          scheduledAt,
          durationMinutes: psy.sessionDuration,
          patientNotes: notes,
          paymentExpireAt,
          status: 'PENDING_PAYMENT',
        },
      });
    }, {
      isolationLevel: 'Serializable', // strongest isolation to prevent race conditions
    });

    // ── Create Stripe PaymentIntent ───────────────────────────────
    const payment = await this.payments.createPaymentIntent(
      appointment.id,
      patient.id,
      Number(psy.sessionRate),
    );

    return {
      appointmentId: appointment.id,
      scheduledAt: appointment.scheduledAt,
      durationMinutes: appointment.durationMinutes,
      expiresAt: appointment.paymentExpireAt,
      payment: {
        clientSecret: payment.stripeClientSecret,
        amount: payment.amount,
        currency: payment.currency,
      },
    };
  }

  // ── Confirm after successful payment ────────────────────────────
  // Called by Stripe webhook — NOT directly by client

  async confirmAfterPayment(appointmentId: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        patient: { include: { user: true } },
        psychologist: { include: { user: true } },
      },
    });

    if (!appointment) throw new NotFoundException();

    // Create Daily.co video room
    const room = await this.video.createRoom(appointmentId, appointment.scheduledAt, appointment.durationMinutes);

    await this.prisma.appointment.update({
      where: { id: appointmentId },
      data: {
        status: 'CONFIRMED',
        videoRoomName: room.name,
        videoRoomUrl: room.url,
      },
    });

    // Send confirmation emails to both parties
    await Promise.all([
      this.notifications.sendAppointmentConfirmed(
        appointment.patient.user.email,
        appointment,
        'patient',
      ),
      this.notifications.sendAppointmentConfirmed(
        appointment.psychologist.user.email,
        appointment,
        'psychologist',
      ),
    ]);
  }

  // ── Cancel appointment ───────────────────────────────────────────

  async cancel(
    appointmentId: string,
    userId: string,
    userRole: UserRole,
    reason?: string,
  ) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        patient: { select: { userId: true } },
        psychologist: { select: { userId: true } },
      },
    });

    if (!appointment) throw new NotFoundException('Rendez-vous introuvable');

    // Verify ownership
    const isPatient = appointment.patient.userId === userId;
    const isPsy = appointment.psychologist.userId === userId;
    if (!isPatient && !isPsy && userRole !== UserRole.ADMIN) {
      throw new ForbiddenException('Accès refusé');
    }

    if (!['PENDING_PAYMENT', 'CONFIRMED'].includes(appointment.status)) {
      throw new BadRequestException('Ce rendez-vous ne peut plus être annulé');
    }

    const cancelledBy = isPatient ? UserRole.PATIENT : UserRole.PSYCHOLOGIST;

    await this.prisma.appointment.update({
      where: { id: appointmentId },
      data: {
        status: isPatient ? 'CANCELLED_BY_PATIENT' : 'CANCELLED_BY_PSYCHOLOGIST',
        cancellationReason: reason,
        cancelledAt: new Date(),
        cancelledBy,
      },
    });

    // Refund if payment was made
    const payment = await this.prisma.payment.findUnique({ where: { appointmentId } });
    if (payment?.status === 'SUCCEEDED') {
      const hoursUntil = (appointment.scheduledAt.getTime() - Date.now()) / 3_600_000;
      // Full refund if cancelled >24h before; 50% if <24h by patient
      const refundAmount = isPatient && hoursUntil < 24
        ? Number(payment.amount) * 0.5
        : Number(payment.amount);

      await this.payments.refund(payment.id, refundAmount, `Annulation par ${cancelledBy}`);
    }

    // Delete Daily.co room if it exists
    if (appointment.videoRoomName) {
      await this.video.deleteRoom(appointment.videoRoomName).catch(() => {});
    }

    return { message: 'Rendez-vous annulé.' };
  }

  // ── Get video access token for a session ─────────────────────────

  async getVideoAccess(appointmentId: string, userId: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        patient: { select: { userId: true, firstName: true } },
        psychologist: { select: { userId: true, firstName: true } },
      },
    });

    if (!appointment) throw new NotFoundException();

    const isPatient = appointment.patient.userId === userId;
    const isPsy = appointment.psychologist.userId === userId;
    if (!isPatient && !isPsy) throw new ForbiddenException();

    if (appointment.status !== 'CONFIRMED') {
      throw new BadRequestException('Séance non disponible');
    }

    const now = new Date();
    const sessionStart = appointment.scheduledAt;
    const minutesUntil = (sessionStart.getTime() - now.getTime()) / 60_000;
    if (minutesUntil > 15) {
      throw new BadRequestException('La séance commence dans plus de 15 minutes');
    }

    const participantName = isPatient
      ? appointment.patient.firstName
      : `${appointment.psychologist.firstName} (Psychologue)`;

    const token = await this.video.createMeetingToken(
      appointment.videoRoomName!,
      participantName,
      isPsy, // isOwner = psychologist is room owner
    );

    // Mark as IN_PROGRESS on first access
    if (appointment.status === 'CONFIRMED') {
      await this.prisma.appointment.update({
        where: { id: appointmentId },
        data: { status: 'IN_PROGRESS', startedAt: new Date() },
      }).catch(() => {});
    }

    return { roomUrl: appointment.videoRoomUrl, token };
  }

  // ── Complete session + trigger review request ────────────────────

  async complete(appointmentId: string) {
    await this.prisma.appointment.update({
      where: { id: appointmentId },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });

    await this.prisma.psychologist.updateMany({
      where: { appointments: { some: { id: appointmentId } } },
      data: { totalSessions: { increment: 1 } },
    });
  }

  // ── Submit review ────────────────────────────────────────────────

  async submitReview(
    appointmentId: string,
    patientUserId: string,
    rating: number,
    comment?: string,
    isPublic = false,
  ) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: { patient: { select: { userId: true } } },
    });

    if (!appointment) throw new NotFoundException();
    if (appointment.patient.userId !== patientUserId) throw new ForbiddenException();
    if (appointment.status !== 'COMPLETED') {
      throw new BadRequestException('Évaluation disponible seulement après la séance');
    }
    if (rating < 1 || rating > 5) throw new BadRequestException('Note entre 1 et 5');

    const review = await this.prisma.review.create({
      data: {
        appointmentId,
        patientId: appointment.patientId,
        psychologistId: appointment.psychologistId,
        rating,
        comment,
        isPublic,
      },
    });

    // Recalculate average rating
    const agg = await this.prisma.review.aggregate({
      where: { psychologistId: appointment.psychologistId },
      _avg: { rating: true },
    });

    await this.prisma.psychologist.update({
      where: { id: appointment.psychologistId },
      data: { averageRating: agg._avg.rating ?? 0 },
    });

    return review;
  }

  // ── Cron: expire unpaid slots every 5 minutes ────────────────────

  @Cron(CronExpression.EVERY_5_MINUTES)
  async expireUnpaidAppointments() {
    const expired = await this.prisma.appointment.updateMany({
      where: {
        status: 'PENDING_PAYMENT',
        paymentExpireAt: { lt: new Date() },
      },
      data: { status: 'EXPIRED' },
    });

    if (expired.count > 0) {
      this.logger.log(`Expired ${expired.count} unpaid appointments`);
    }
  }

  // ── Cron: send reminders ──────────────────────────────────────────

  @Cron(CronExpression.EVERY_HOUR)
  async sendReminders() {
    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * 3_600_000);
    const in25h = new Date(now.getTime() + 25 * 3_600_000);

    const upcoming24h = await this.prisma.appointment.findMany({
      where: {
        status: 'CONFIRMED',
        reminderSent24h: false,
        scheduledAt: { gte: in24h, lt: in25h },
      },
      include: { patient: { include: { user: true } } },
    });

    for (const appt of upcoming24h) {
      await this.notifications.sendReminder(appt.patient.user.email, appt, '24h');
      await this.prisma.appointment.update({
        where: { id: appt.id },
        data: { reminderSent24h: true },
      });
    }
  }

  // ── Private helpers ───────────────────────────────────────────────

  private async verifyAvailability(tx: any, psy: any, scheduledAt: Date) {
    const dayOfWeek = scheduledAt.getDay();
    const timeStr = scheduledAt.toTimeString().slice(0, 5); // "HH:MM"

    const slot = await tx.availabilitySlot.findFirst({
      where: {
        psychologistId: psy.id,
        dayOfWeek,
        isActive: true,
        startTime: { lte: timeStr },
        endTime: { gt: timeStr },
      },
    });

    if (!slot) {
      throw new BadRequestException('Ce créneau n\'est pas dans les disponibilités du psychologue');
    }

    const blocked = await tx.blockedSlot.findFirst({
      where: {
        psychologistId: psy.id,
        startsAt: { lte: scheduledAt },
        endsAt: { gt: scheduledAt },
      },
    });

    if (blocked) {
      throw new ConflictException('Le psychologue est indisponible à cette date');
    }
  }
}
