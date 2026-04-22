import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomBytes, createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { NotificationsService } from '../notifications/notifications.service';

const BCRYPT_ROUNDS = 12;
const REFRESH_TOKEN_BYTES = 64;
const PASSWORD_RESET_EXPIRES_MS = 60 * 60 * 1000; // 1 hour

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Register ────────────────────────────────────────────────────

  async register(dto: RegisterDto, ip: string) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Un compte existe déjà avec cet email');

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const emailVerifyToken = randomBytes(32).toString('hex');

    // En bêta (BETA_AUTO_VERIFY_EMAIL=true), on valide automatiquement l'email
    // sans envoi réel — utile tant que SendGrid n'est pas configuré.
    const autoVerify = this.config.get<string>('BETA_AUTO_VERIFY_EMAIL') === 'true';

    const user = await this.prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email: dto.email.toLowerCase().trim(),
          passwordHash,
          role: dto.role,
          emailVerifyToken: autoVerify ? null : emailVerifyToken,
          emailVerifiedAt: autoVerify ? new Date() : null,
        },
      });

      if (dto.role === UserRole.PATIENT) {
        await tx.patient.create({
          data: {
            userId: newUser.id,
            firstName: dto.firstName,
            lastName: dto.lastName,
            timezone: dto.timezone ?? 'Europe/Paris',
            gdprConsentAt: dto.gdprConsent ? new Date() : null,
          },
        });
      } else if (dto.role === UserRole.PSYCHOLOGIST) {
        // En bêta (BETA_AUTO_APPROVE_PSY=true), on auto-approuve les psys pour
        // qu'ils apparaissent immédiatement sur le site sans validation manuelle.
        const autoApprove = this.config.get<string>('BETA_AUTO_APPROVE_PSY') === 'true';

        await tx.psychologist.create({
          data: {
            userId: newUser.id,
            firstName: dto.firstName,
            lastName: dto.lastName,
            timezone: dto.timezone ?? 'Europe/Paris',
            // Pré-remplissage du profil avec les infos fournies à l'inscription
            title: dto.title?.trim() || 'Psychologue',
            bio: dto.bio?.trim() || null,
            specialties: Array.isArray(dto.specialties) ? dto.specialties.filter(Boolean) : [],
            languages: Array.isArray(dto.languages) ? dto.languages.filter(Boolean) : [],
            rppsNumber: dto.rppsNumber?.trim() || null,
            yearsExperience: dto.yearsExperience ?? null,
            sessionRate: dto.sessionRate ?? 0,
            sessionDuration: dto.sessionDuration ?? 60,
            status: autoApprove ? 'APPROVED' : 'PENDING',
            approvedAt: autoApprove ? new Date() : null,
          },
        });
      }

      return newUser;
    });

    // En bêta : on skip l'envoi. En prod : envoi non-bloquant.
    if (!autoVerify) {
      this.notifications.sendEmailVerification(user.email, emailVerifyToken).catch(
        (err) => this.logger.error('Email verification send failed', err),
      );
    }

    return {
      message: autoVerify
        ? 'Compte créé. Vous pouvez vous connecter.'
        : 'Compte créé. Vérifiez votre email pour activer votre compte.',
    };
  }

  // ── Login ───────────────────────────────────────────────────────

  async login(dto: LoginDto, ip: string, userAgent: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase().trim() },
    });

    if (!user || !await bcrypt.compare(dto.password, user.passwordHash)) {
      throw new UnauthorizedException('Email ou mot de passe incorrect');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Compte désactivé. Contactez le support.');
    }

    if (!user.emailVerifiedAt) {
      throw new UnauthorizedException('Veuillez vérifier votre email avant de vous connecter.');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return this.generateTokenPair(user.id, user.email, user.role, ip, userAgent);
  }

  // ── Refresh access token ────────────────────────────────────────

  async refresh(rawRefreshToken: string, ip: string, userAgent: string) {
    const tokenHash = this.hashToken(rawRefreshToken);

    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: { select: { id: true, email: true, role: true, isActive: true } } },
    });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Session expirée. Veuillez vous reconnecter.');
    }

    if (!stored.user.isActive) {
      throw new UnauthorizedException('Compte désactivé.');
    }

    // Rotate: revoke old token, issue new pair
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    return this.generateTokenPair(
      stored.user.id,
      stored.user.email,
      stored.user.role,
      ip,
      userAgent,
    );
  }

  // ── Logout ──────────────────────────────────────────────────────

  async logout(rawRefreshToken: string) {
    const tokenHash = this.hashToken(rawRefreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { message: 'Déconnecté avec succès.' };
  }

  // ── Email verification ───────────────────────────────────────────

  async verifyEmail(token: string) {
    const user = await this.prisma.user.findUnique({
      where: { emailVerifyToken: token },
    });

    if (!user) throw new BadRequestException('Lien de vérification invalide ou expiré.');

    await this.prisma.user.update({
      where: { id: user.id },
      data: { emailVerifiedAt: new Date(), emailVerifyToken: null },
    });

    return { message: 'Email vérifié. Vous pouvez maintenant vous connecter.' };
  }

  // ── Password reset ───────────────────────────────────────────────

  async requestPasswordReset(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    // Always return success to avoid user enumeration
    if (!user) return { message: 'Si ce compte existe, un email a été envoyé.' };

    const token = randomBytes(32).toString('hex');
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        resetPasswordToken: token,
        resetPasswordExpires: new Date(Date.now() + PASSWORD_RESET_EXPIRES_MS),
      },
    });

    this.notifications.sendPasswordReset(user.email, token).catch(
      (err) => this.logger.error('Password reset email failed', err),
    );

    return { message: 'Si ce compte existe, un email a été envoyé.' };
  }

  async resetPassword(token: string, newPassword: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        resetPasswordToken: token,
        resetPasswordExpires: { gt: new Date() },
      },
    });

    if (!user) throw new BadRequestException('Lien expiré ou invalide.');

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash, resetPasswordToken: null, resetPasswordExpires: null },
      }),
      // Revoke all refresh tokens on password change
      this.prisma.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    return { message: 'Mot de passe réinitialisé avec succès.' };
  }

  // ── Private helpers ──────────────────────────────────────────────

  private async generateTokenPair(
    userId: string,
    email: string,
    role: UserRole,
    ip: string,
    userAgent: string,
  ) {
    const payload = { sub: userId, email, role };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.config.get('jwt.accessSecret'),
      expiresIn: this.config.get('jwt.accessExpiresIn'),
    });

    const rawRefreshToken = randomBytes(REFRESH_TOKEN_BYTES).toString('hex');
    const tokenHash = this.hashToken(rawRefreshToken);

    const refreshExpiresIn = this.config.get<string>('jwt.refreshExpiresIn', '7d');
    const expiresAt = new Date(Date.now() + this.parseDuration(refreshExpiresIn));

    await this.prisma.refreshToken.create({
      data: { userId, tokenHash, expiresAt, ipAddress: ip, userAgent },
    });

    return { accessToken, refreshToken: rawRefreshToken, role, userId, email };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private parseDuration(duration: string): number {
    const unit = duration.slice(-1);
    const value = parseInt(duration.slice(0, -1), 10);
    const map: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
    return value * (map[unit] ?? 3_600_000);
  }
}
