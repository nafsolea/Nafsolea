import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationType } from '@prisma/client';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private transporter: nodemailer.Transporter;
  private readonly fromEmail: string;
  private readonly fromName: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.fromEmail = config.get('email.from', 'noreply@nafsolea.com');
    this.fromName = config.get('email.fromName', 'Nafsoléa');

    // Configure SendGrid SMTP transport
    this.transporter = nodemailer.createTransport({
      host: 'smtp.sendgrid.net',
      port: 587,
      auth: {
        user: 'apikey',
        pass: config.get('email.sendgridKey'),
      },
    });
  }

  // ── Email: account verification ──────────────────────────────────

  async sendEmailVerification(email: string, token: string) {
    const frontendUrl = this.config.get('frontendUrl', 'http://localhost:8080');
    const link = `${frontendUrl}/verify-email?token=${token}`;

    await this.send(email, 'Vérifiez votre email — Nafsoléa', `
      <h2>Bienvenue sur Nafsoléa</h2>
      <p>Cliquez sur le lien ci-dessous pour vérifier votre adresse email :</p>
      <a href="${link}" style="background:#5585B5;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;">
        Vérifier mon email
      </a>
      <p>Ce lien expire dans 24 heures.</p>
    `);
  }

  // ── Email: password reset ────────────────────────────────────────

  async sendPasswordReset(email: string, token: string) {
    const frontendUrl = this.config.get('frontendUrl');
    const link = `${frontendUrl}/reset-password?token=${token}`;

    await this.send(email, 'Réinitialisation de votre mot de passe — Nafsoléa', `
      <h2>Réinitialisation de mot de passe</h2>
      <p>Vous avez demandé la réinitialisation de votre mot de passe.</p>
      <a href="${link}" style="background:#AF3B6E;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;">
        Réinitialiser mon mot de passe
      </a>
      <p>Ce lien expire dans 1 heure. Si vous n'avez pas fait cette demande, ignorez cet email.</p>
    `);
  }

  // ── Email: appointment confirmed ─────────────────────────────────

  async sendAppointmentConfirmed(
    email: string,
    appointment: { scheduledAt: Date; durationMinutes: number; videoRoomUrl?: string | null },
    role: 'patient' | 'psychologist',
  ) {
    const dateStr = appointment.scheduledAt.toLocaleString('fr-FR', {
      dateStyle: 'full',
      timeStyle: 'short',
      timeZone: 'Europe/Paris',
    });

    const subject = role === 'patient'
      ? 'Votre rendez-vous est confirmé — Nafsoléa'
      : 'Nouveau rendez-vous confirmé — Nafsoléa';

    await this.send(email, subject, `
      <h2>Rendez-vous confirmé ✓</h2>
      <p>📅 <strong>Date :</strong> ${dateStr}</p>
      <p>⏱ <strong>Durée :</strong> ${appointment.durationMinutes} minutes</p>
      <p>Vous recevrez un rappel 24h et 1h avant votre séance.</p>
      ${appointment.videoRoomUrl ? `
        <p>Rejoignez la séance ici (disponible 15 min avant) :</p>
        <a href="${appointment.videoRoomUrl}" style="background:#5585B5;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;">
          Rejoindre la séance
        </a>
      ` : ''}
    `);

    await this.createInAppNotification(
      email,
      NotificationType.APPOINTMENT_CONFIRMED,
      'Rendez-vous confirmé',
      `Votre séance du ${dateStr} est confirmée.`,
    );
  }

  // ── Email: reminder ──────────────────────────────────────────────

  async sendReminder(
    email: string,
    appointment: { scheduledAt: Date; videoRoomUrl?: string | null },
    delay: '24h' | '1h',
  ) {
    const dateStr = appointment.scheduledAt.toLocaleString('fr-FR', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: 'Europe/Paris',
    });

    await this.send(
      email,
      `Rappel : votre séance ${delay === '24h' ? 'demain' : 'dans 1 heure'} — Nafsoléa`,
      `
        <h2>Rappel de votre séance</h2>
        <p>Votre consultation a lieu <strong>${delay === '24h' ? 'demain' : 'dans 1 heure'}</strong> à ${dateStr}.</p>
        ${appointment.videoRoomUrl ? `
          <a href="${appointment.videoRoomUrl}" style="background:#5585B5;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;">
            Rejoindre la séance
          </a>
        ` : ''}
      `,
    );
  }

  // ── Email: psychologist approval ─────────────────────────────────

  async sendPsychologistApproved(email: string, firstName: string) {
    await this.send(email, 'Votre profil a été validé — Nafsoléa', `
      <h2>Bienvenue dans l'équipe Nafsoléa, ${firstName} !</h2>
      <p>Votre profil de psychologue a été validé par notre équipe.</p>
      <p>Vous pouvez maintenant configurer vos disponibilités et recevoir des patients.</p>
      <a href="${this.config.get('frontendUrl')}/psychologues/me" style="background:#5585B5;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;">
        Accéder à mon tableau de bord
      </a>
    `);
  }

  // ── Private: raw email sender ────────────────────────────────────

  private async send(to: string, subject: string, htmlContent: string) {
    const html = this.wrapInTemplate(subject, htmlContent);

    try {
      await this.transporter.sendMail({
        from: `"${this.fromName}" <${this.fromEmail}>`,
        to,
        subject,
        html,
      });
      this.logger.log(`Email sent to ${to}: ${subject}`);
    } catch (err) {
      this.logger.error(`Email failed to ${to}: ${(err as Error).message}`);
      throw err;
    }
  }

  private wrapInTemplate(title: string, content: string): string {
    return `
      <!DOCTYPE html>
      <html lang="fr">
      <head><meta charset="UTF-8"><title>${title}</title></head>
      <body style="font-family:Poppins,Arial,sans-serif;background:#EAF2F9;padding:20px;margin:0;">
        <div style="max-width:560px;margin:0 auto;background:white;border-radius:16px;overflow:hidden;">
          <div style="background:#2B3B5E;padding:24px;text-align:center;">
            <span style="color:white;font-size:22px;font-weight:700;">Nafsoléa</span>
          </div>
          <div style="padding:32px;color:#2B3B5E;line-height:1.6;">
            ${content}
          </div>
          <div style="background:#EAF2F9;padding:16px;text-align:center;font-size:12px;color:#666;">
            Nafsoléa · Teleconsultation psychologique<br>
            <a href="${this.config.get('frontendUrl')}" style="color:#5585B5;">nafsolea.com</a>
            · <a href="${this.config.get('frontendUrl')}/rgpd" style="color:#5585B5;">Politique de confidentialité</a>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  // ── In-app notification ───────────────────────────────────────────

  private async createInAppNotification(
    email: string,
    type: NotificationType,
    title: string,
    body: string,
    metadata?: object,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (!user) return;

    await this.prisma.notification.create({
      data: { userId: user.id, type, title, body, sentAt: new Date(), metadata },
    });
  }
}
