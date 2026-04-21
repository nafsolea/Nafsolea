import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getMyProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            dateOfBirth: true,
            phone: true,
            languages: true,
            preferredLanguage: true,
            timezone: true,
            issues: true,
            avatarUrl: true,
          },
        },
        psychologist: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            title: true,
            bio: true,
            specialties: true,
            languages: true,
            sessionRate: true,
            status: true,
            averageRating: true,
            totalSessions: true,
            avatarUrl: true,
          },
        },
      },
    });

    if (!user) throw new NotFoundException('Utilisateur introuvable');

    const { passwordHash, emailVerifyToken, resetPasswordToken, ...safeUser } = user;
    return safeUser;
  }

  async updatePatientProfile(userId: string, data: Partial<{
    firstName: string;
    lastName: string;
    phone: string;
    languages: string[];
    preferredLanguage: string;
    timezone: string;
    issues: string[];
  }>) {
    const patient = await this.prisma.patient.findUnique({ where: { userId } });
    if (!patient) throw new NotFoundException('Profil patient introuvable');

    return this.prisma.patient.update({ where: { userId }, data });
  }

  async getPatientAppointments(userId: string, status?: string) {
    const patient = await this.prisma.patient.findUnique({ where: { userId } });
    if (!patient) throw new NotFoundException();

    return this.prisma.appointment.findMany({
      where: {
        patientId: patient.id,
        ...(status && { status: status as never }),
      },
      include: {
        psychologist: {
          select: {
            firstName: true,
            lastName: true,
            title: true,
            avatarUrl: true,
          },
        },
        payment: { select: { status: true, amount: true, receiptUrl: true } },
      },
      orderBy: { scheduledAt: 'desc' },
    });
  }

  async getNotifications(userId: string, unreadOnly = false) {
    return this.prisma.notification.findMany({
      where: { userId, ...(unreadOnly && { isRead: false }) },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async markNotificationsRead(userId: string, ids: string[]) {
    await this.prisma.notification.updateMany({
      where: { userId, id: { in: ids } },
      data: { isRead: true, readAt: new Date() },
    });
    return { message: 'Notifications marquées comme lues' };
  }

  // RGPD: right to erasure
  async requestAccountDeletion(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { patient: true },
    });
    if (!user) throw new NotFoundException();

    if (user.patient) {
      await this.prisma.anonymizePatient(user.patient.id);
    } else {
      await this.prisma.user.update({
        where: { id: userId },
        data: { isActive: false },
      });
    }

    return { message: 'Votre compte a été anonymisé conformément au RGPD.' };
  }
}
