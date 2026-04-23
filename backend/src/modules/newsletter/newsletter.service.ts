import { Injectable, Logger, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class NewsletterService {
  private readonly logger = new Logger(NewsletterService.name);
  private transporter: nodemailer.Transporter | null = null;
  private readonly fromEmail: string;
  private readonly fromName: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.fromEmail = config.get('email.from', 'noreply@nafsolea.com');
    this.fromName = config.get('email.fromName', 'Nafsoléa');

    const sendgridKey = config.get<string>('email.sendgridKey');
    // On accepte uniquement une vraie clé SendGrid (≥ 30 caractères, pas un placeholder).
    // Les valeurs par défaut du render.yaml ("SG.placeholder_replace_after_signup") sont
    // refusées explicitement pour éviter le 535 Authentication failed.
    const isRealKey = !!sendgridKey
      && sendgridKey.startsWith('SG.')
      && !sendgridKey.toLowerCase().includes('placeholder')
      && sendgridKey.length > 30;

    if (isRealKey) {
      this.transporter = nodemailer.createTransport({
        host: 'smtp.sendgrid.net',
        port: 587,
        auth: { user: 'apikey', pass: sendgridKey },
      });
      this.logger.log('SendGrid configuré — les newsletters seront vraiment envoyées.');
    } else {
      this.logger.warn('SendGrid non configuré (ou clé placeholder) — mode DRY RUN : les newsletters sont enregistrées mais pas envoyées par email.');
    }
  }

  // ── Public ────────────────────────────────────────────────────────

  async subscribe(email: string, source = 'homepage') {
    const normalized = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) {
      throw new BadRequestException('Adresse email invalide');
    }

    const existing = await this.prisma.newsletterSubscriber.findUnique({
      where: { email: normalized },
    });

    // Déjà abonné et actif → rien à faire (on ne révèle pas l'info pour la vie privée)
    if (existing && !existing.unsubscribedAt) {
      return { ok: true, message: 'Inscription confirmée' };
    }

    // Réinscription d'un ancien désabonné
    if (existing && existing.unsubscribedAt) {
      await this.prisma.newsletterSubscriber.update({
        where: { id: existing.id },
        data: { unsubscribedAt: null, subscribedAt: new Date(), source },
      });
      return { ok: true, message: 'Réinscription confirmée' };
    }

    await this.prisma.newsletterSubscriber.create({
      data: {
        email: normalized,
        source,
        unsubscribeToken: randomBytes(32).toString('hex'),
      },
    });

    return { ok: true, message: 'Inscription confirmée' };
  }

  async unsubscribe(token: string) {
    const sub = await this.prisma.newsletterSubscriber.findUnique({
      where: { unsubscribeToken: token },
    });
    if (!sub) throw new NotFoundException('Lien de désabonnement invalide');

    await this.prisma.newsletterSubscriber.update({
      where: { id: sub.id },
      data: { unsubscribedAt: new Date() },
    });

    return { ok: true, message: 'Désabonnement effectué' };
  }

  // ── Admin ─────────────────────────────────────────────────────────

  async listSubscribers(opts: { page?: number; limit?: number; activeOnly?: boolean } = {}) {
    const { page = 1, limit = 50, activeOnly = false } = opts;
    const skip = (page - 1) * limit;
    const where = activeOnly ? { unsubscribedAt: null } : {};

    const [data, total] = await this.prisma.$transaction([
      this.prisma.newsletterSubscriber.findMany({
        where,
        skip,
        take: limit,
        orderBy: { subscribedAt: 'desc' },
      }),
      this.prisma.newsletterSubscriber.count({ where }),
    ]);

    return { data, meta: { total, page, limit, pages: Math.ceil(total / limit) } };
  }

  async getStats() {
    const [total, active, campaigns] = await this.prisma.$transaction([
      this.prisma.newsletterSubscriber.count(),
      this.prisma.newsletterSubscriber.count({ where: { unsubscribedAt: null } }),
      this.prisma.newsletterCampaign.count({ where: { sentAt: { not: null } } }),
    ]);
    return { total, active, unsubscribed: total - active, campaignsSent: campaigns };
  }

  async listCampaigns(opts: { page?: number; limit?: number } = {}) {
    const { page = 1, limit = 20 } = opts;
    const skip = (page - 1) * limit;

    const [data, total] = await this.prisma.$transaction([
      this.prisma.newsletterCampaign.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.newsletterCampaign.count(),
    ]);

    return { data, meta: { total, page, limit, pages: Math.ceil(total / limit) } };
  }

  async createDraft(adminUserId: string, dto: { subject: string; contentHtml: string }) {
    if (!dto.subject?.trim() || !dto.contentHtml?.trim()) {
      throw new BadRequestException('Sujet et contenu requis');
    }
    return this.prisma.newsletterCampaign.create({
      data: {
        subject: dto.subject.trim(),
        contentHtml: dto.contentHtml,
        createdById: adminUserId,
      },
    });
  }

  async sendCampaign(campaignId: string) {
    const campaign = await this.prisma.newsletterCampaign.findUnique({
      where: { id: campaignId },
    });
    if (!campaign) throw new NotFoundException('Campagne introuvable');
    if (campaign.sentAt) throw new ConflictException('Campagne déjà envoyée');

    const subscribers = await this.prisma.newsletterSubscriber.findMany({
      where: { unsubscribedAt: null },
    });

    if (subscribers.length === 0) {
      throw new BadRequestException("Aucun abonné actif à qui envoyer");
    }

    const frontendUrl = this.config.get('frontendUrl', 'https://nafsolea.com');
    let sent = 0;
    let failed = 0;

    for (const sub of subscribers) {
      try {
        const unsubLink = `${frontendUrl}/unsubscribe.html?token=${sub.unsubscribeToken}`;
        const html = this.wrap(campaign.subject, campaign.contentHtml, unsubLink);

        if (this.transporter) {
          await this.transporter.sendMail({
            from: `"${this.fromName}" <${this.fromEmail}>`,
            to: sub.email,
            subject: campaign.subject,
            html,
          });
        } else {
          this.logger.log(`[DRY RUN] Newsletter "${campaign.subject}" → ${sub.email}`);
        }
        sent++;
      } catch (err) {
        failed++;
        this.logger.error(`Échec envoi à ${sub.email}: ${(err as Error).message}`);
      }
    }

    return this.prisma.newsletterCampaign.update({
      where: { id: campaignId },
      data: { sentAt: new Date(), sentToCount: sent, failedCount: failed },
    });
  }

  async deleteCampaign(campaignId: string) {
    const campaign = await this.prisma.newsletterCampaign.findUnique({
      where: { id: campaignId },
    });
    if (!campaign) throw new NotFoundException('Campagne introuvable');
    if (campaign.sentAt) throw new ConflictException('Impossible de supprimer une campagne envoyée');

    await this.prisma.newsletterCampaign.delete({ where: { id: campaignId } });
    return { ok: true };
  }

  async deleteSubscriber(subscriberId: string) {
    await this.prisma.newsletterSubscriber.delete({ where: { id: subscriberId } });
    return { ok: true };
  }

  // ── Helpers ───────────────────────────────────────────────────────

  private wrap(title: string, content: string, unsubLink: string): string {
    return `
      <!DOCTYPE html>
      <html lang="fr">
      <head><meta charset="UTF-8"><title>${title}</title></head>
      <body style="font-family:Poppins,Arial,sans-serif;background:#EAF2F9;padding:20px;margin:0;">
        <div style="max-width:600px;margin:0 auto;background:white;border-radius:16px;overflow:hidden;">
          <div style="background:#2B3B5E;padding:24px;text-align:center;">
            <span style="color:white;font-size:22px;font-weight:700;">Nafsoléa</span>
          </div>
          <div style="padding:32px;color:#2B3B5E;line-height:1.6;">
            ${content}
          </div>
          <div style="background:#EAF2F9;padding:16px;text-align:center;font-size:12px;color:#666;">
            Vous recevez cet email parce que vous êtes abonné à la newsletter Nafsoléa.<br>
            <a href="${unsubLink}" style="color:#5585B5;">Se désabonner</a>
          </div>
        </div>
      </body>
      </html>
    `;
  }
}
