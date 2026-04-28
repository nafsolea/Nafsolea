import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PsychologistStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Dashboard stats ──────────────────────────────────────────────

  async getDashboardStats() {
    const [
      totalPatients,
      totalPsychologists,
      pendingValidations,
      totalAppointments,
      completedAppointments,
      totalRevenue,
      recentAppointments,
    ] = await this.prisma.$transaction([
      this.prisma.patient.count(),
      this.prisma.psychologist.count({ where: { status: 'APPROVED' } }),
      this.prisma.psychologist.count({ where: { status: 'PENDING' } }),
      this.prisma.appointment.count(),
      this.prisma.appointment.count({ where: { status: 'COMPLETED' } }),
      this.prisma.payment.aggregate({
        where: { status: 'SUCCEEDED' },
        _sum: { amount: true },
      }),
      this.prisma.appointment.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
          patient: { select: { firstName: true, lastName: true } },
          psychologist: { select: { firstName: true, lastName: true } },
          payment: { select: { status: true, amount: true } },
        },
      }),
    ]);

    return {
      users: { patients: totalPatients, psychologists: totalPsychologists },
      pendingValidations,
      appointments: { total: totalAppointments, completed: completedAppointments },
      revenue: { total: totalRevenue._sum.amount ?? 0, currency: 'EUR' },
      recentAppointments,
    };
  }

  // ── Psychologist validation ──────────────────────────────────────

  async getPendingPsychologists() {
    return this.prisma.psychologist.findMany({
      where: { status: PsychologistStatus.PENDING },
      include: {
        user: { select: { email: true, createdAt: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async approvePsychologist(id: string, adminUserId: string) {
    const psy = await this.prisma.psychologist.findUnique({
      where: { id },
      include: { user: true },
    });
    if (!psy) throw new NotFoundException('Psychologue introuvable');
    if (psy.status !== PsychologistStatus.PENDING) {
      throw new BadRequestException('Ce profil n\'est pas en attente de validation');
    }

    await this.prisma.psychologist.update({
      where: { id },
      data: {
        status: PsychologistStatus.APPROVED,
        approvedAt: new Date(),
        approvedById: adminUserId,
      },
    });

    await this.notifications.sendPsychologistApproved(psy.user.email, psy.firstName);

    return { message: `${psy.firstName} ${psy.lastName} a été validé(e)` };
  }

  async rejectPsychologist(id: string, reason: string) {
    const psy = await this.prisma.psychologist.findUnique({
      where: { id },
      include: { user: true },
    });
    if (!psy) throw new NotFoundException();

    await this.prisma.psychologist.update({
      where: { id },
      data: { status: PsychologistStatus.REJECTED, rejectionReason: reason },
    });

    // TODO: send rejection email with reason

    return { message: 'Profil rejeté' };
  }

  /**
   * Modifier le profil d'un psy depuis l'admin (tarif, durée, langues, bio…).
   * Les mêmes garde-fous que pour l'auto-update côté psy s'appliquent.
   */
  async updatePsychologist(id: string, data: Partial<{
    bio: string;
    title: string;
    specialties: string[];
    languages: string[];
    sessionRate: number;
    sessionDuration: number;
    yearsExperience: number;
  }>) {
    const psy = await this.prisma.psychologist.findUnique({ where: { id } });
    if (!psy) throw new NotFoundException('Psychologue introuvable');

    if (data.sessionRate !== undefined && data.sessionRate < 0) {
      throw new BadRequestException('Le tarif ne peut pas être négatif');
    }
    if (data.sessionDuration !== undefined && (data.sessionDuration < 15 || data.sessionDuration > 180)) {
      throw new BadRequestException('La durée doit être comprise entre 15 et 180 minutes');
    }

    return this.prisma.psychologist.update({
      where: { id },
      data,
    });
  }

  // ── Services / Prestations (admin) ──────────────────────────────

  private validateServiceData(data: Partial<{ name: string; price: number; durationMinutes: number }>) {
    if (data.name !== undefined && !data.name.trim()) {
      throw new BadRequestException('Le nom de la prestation est requis');
    }
    if (data.price !== undefined && data.price < 0) {
      throw new BadRequestException('Le tarif ne peut pas être négatif');
    }
    if (data.durationMinutes !== undefined && (data.durationMinutes < 15 || data.durationMinutes > 240)) {
      throw new BadRequestException('La durée doit être comprise entre 15 et 240 minutes');
    }
  }

  async listPsychologistServices(psychologistId: string) {
    const psy = await this.prisma.psychologist.findUnique({ where: { id: psychologistId } });
    if (!psy) throw new NotFoundException('Psychologue introuvable');
    return this.prisma.service.findMany({
      where: { psychologistId },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async createPsychologistService(psychologistId: string, data: {
    name: string;
    description?: string;
    price: number;
    durationMinutes: number;
    displayOrder?: number;
  }) {
    const psy = await this.prisma.psychologist.findUnique({ where: { id: psychologistId } });
    if (!psy) throw new NotFoundException('Psychologue introuvable');
    this.validateServiceData(data);

    // Plafond : 4 prestations max par psy
    const count = await this.prisma.service.count({ where: { psychologistId } });
    if (count >= 4) {
      throw new BadRequestException('Ce psychologue a déjà 4 prestations (maximum). Supprimez-en une avant d\'en ajouter une nouvelle.');
    }

    return this.prisma.service.create({
      data: {
        psychologistId,
        name: data.name.trim(),
        description: data.description?.trim() || null,
        price: data.price,
        durationMinutes: data.durationMinutes,
        displayOrder: data.displayOrder ?? 0,
      },
    });
  }

  async updatePsychologistService(psychologistId: string, serviceId: string, data: Partial<{
    name: string;
    description: string;
    price: number;
    durationMinutes: number;
    isActive: boolean;
    displayOrder: number;
  }>) {
    const svc = await this.prisma.service.findUnique({ where: { id: serviceId } });
    if (!svc) throw new NotFoundException('Prestation introuvable');
    if (svc.psychologistId !== psychologistId) {
      throw new BadRequestException('Cette prestation n\'appartient pas à ce psychologue');
    }
    this.validateServiceData(data);

    return this.prisma.service.update({
      where: { id: serviceId },
      data: {
        ...(data.name !== undefined && { name: data.name.trim() }),
        ...(data.description !== undefined && { description: data.description?.trim() || null }),
        ...(data.price !== undefined && { price: data.price }),
        ...(data.durationMinutes !== undefined && { durationMinutes: data.durationMinutes }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
        ...(data.displayOrder !== undefined && { displayOrder: data.displayOrder }),
      },
    });
  }

  async deletePsychologistService(psychologistId: string, serviceId: string) {
    const svc = await this.prisma.service.findUnique({ where: { id: serviceId } });
    if (!svc) throw new NotFoundException('Prestation introuvable');
    if (svc.psychologistId !== psychologistId) {
      throw new BadRequestException('Cette prestation n\'appartient pas à ce psychologue');
    }

    // Suppression libre — l'historique est protégé par le snapshot
    // (serviceName, durationMinutes, prix) gardé sur l'Appointment.
    await this.prisma.service.delete({ where: { id: serviceId } });
    return { message: 'Prestation supprimée' };
  }

  // ── User management ──────────────────────────────────────────────

  async getUsers(page = 1, limit = 20, search?: string, role?: string) {
    const skip = (page - 1) * limit;

    const conditions: any[] = [];
    if (role && ['PATIENT', 'PSYCHOLOGIST', 'ADMIN'].includes(role)) {
      conditions.push({ role: role as any });
    }
    if (search) {
      conditions.push({
        OR: [
          { email: { contains: search, mode: 'insensitive' as const } },
          { patient: { firstName: { contains: search, mode: 'insensitive' as const } } },
          { patient: { lastName: { contains: search, mode: 'insensitive' as const } } },
          { psychologist: { firstName: { contains: search, mode: 'insensitive' as const } } },
          { psychologist: { lastName: { contains: search, mode: 'insensitive' as const } } },
        ],
      });
    }
    const where = conditions.length ? { AND: conditions } : {};

    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          role: true,
          isActive: true,
          emailVerifiedAt: true,
          createdAt: true,
          lastLoginAt: true,
          patient: { select: { firstName: true, lastName: true } },
          psychologist: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              status: true,
              title: true,
              specialties: true,
              languages: true,
              sessionRate: true,
              yearsExperience: true,
              avatarUrl: true,
              rppsNumber: true,
              bio: true,
            },
          },
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return { data: users, meta: { total, page, limit, pages: Math.ceil(total / limit) } };
  }

  async suspendUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException();

    await this.prisma.user.update({
      where: { id: userId },
      data: { isActive: false },
    });

    // Revoke all tokens
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return { message: 'Compte suspendu' };
  }

  /**
   * Validation manuelle de l'email d'un utilisateur par l'admin.
   * Utile en bêta tant que SendGrid n'est pas configuré : l'admin peut
   * débloquer l'accès d'un utilisateur sans qu'il ait reçu d'email.
   */
  async verifyUserEmail(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Utilisateur introuvable');
    if (user.emailVerifiedAt) {
      return { message: 'Email déjà vérifié', alreadyVerified: true };
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { emailVerifiedAt: new Date(), emailVerifyToken: null },
    });

    return { message: `Email de ${user.email} validé manuellement` };
  }

  // ── Appointment management ───────────────────────────────────────

  async getAppointments(page = 1, limit = 20, status?: string) {
    const skip = (page - 1) * limit;

    const [appointments, total] = await this.prisma.$transaction([
      this.prisma.appointment.findMany({
        where: status ? { status: status as never } : {},
        include: {
          patient: { select: { firstName: true, lastName: true, user: { select: { email: true } } } },
          psychologist: { select: { firstName: true, lastName: true } },
          payment: { select: { status: true, amount: true } },
        },
        skip,
        take: limit,
        orderBy: { scheduledAt: 'desc' },
      }),
      this.prisma.appointment.count({ where: status ? { status: status as never } : {} }),
    ]);

    return { data: appointments, meta: { total, page, limit } };
  }

  // ── Revenue / payments ───────────────────────────────────────────

  async getRevenueReport(from: Date, to: Date) {
    const payments = await this.prisma.payment.findMany({
      where: {
        status: 'SUCCEEDED',
        createdAt: { gte: from, lte: to },
      },
      include: {
        appointment: {
          include: {
            psychologist: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });

    const totalRevenue = payments.reduce((sum, p) => sum + Number(p.amount), 0);
    const totalFees = payments.reduce((sum, p) => sum + Number(p.platformFee ?? 0), 0);
    const totalPayouts = payments.reduce((sum, p) => sum + Number(p.psychologistPayout ?? 0), 0);

    return {
      period: { from, to },
      summary: { totalRevenue, totalFees, totalPayouts, sessionCount: payments.length },
      payments: payments.map((p) => ({
        date: p.createdAt,
        amount: p.amount,
        psychologist: `${p.appointment.psychologist.firstName} ${p.appointment.psychologist.lastName}`,
        fee: p.platformFee,
        payout: p.psychologistPayout,
      })),
    };
  }

  // ── Audit logs ───────────────────────────────────────────────────

  async getAuditLogs(page = 1, limit = 50, userId?: string) {
    const skip = (page - 1) * limit;
    const where = userId ? { userId } : {};

    const [logs, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        include: { user: { select: { email: true, role: true } } },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { data: logs, meta: { total, page, limit } };
  }
}
