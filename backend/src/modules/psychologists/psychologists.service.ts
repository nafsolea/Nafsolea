import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { addDays, startOfDay, format, parseISO, getDay, isWithinInterval } from 'date-fns';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';

@Injectable()
export class PsychologistsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Public listing ──────────────────────────────────────────────

  async findAll(filters: {
    language?: string;
    specialty?: string;
    maxRate?: number;
    page?: number;
    limit?: number;
  }) {
    const { language, specialty, maxRate, page = 1, limit = 12 } = filters;
    const skip = (page - 1) * limit;

    const where = {
      status: 'APPROVED' as const,
      ...(language && { languages: { has: language } }),
      ...(specialty && { specialties: { has: specialty } }),
      ...(maxRate && { sessionRate: { lte: maxRate } }),
    };

    const [psychologists, total] = await this.prisma.$transaction([
      this.prisma.psychologist.findMany({
        where,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          title: true,
          bio: true,
          specialties: true,
          languages: true,
          sessionRate: true,
          sessionDuration: true,
          averageRating: true,
          totalSessions: true,
          avatarUrl: true,
          yearsExperience: true,
          services: {
            where: { isActive: true },
            select: { id: true, name: true, price: true, durationMinutes: true },
            orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
          },
        },
        skip,
        take: limit,
        orderBy: [{ averageRating: 'desc' }, { totalSessions: 'desc' }],
      }),
      this.prisma.psychologist.count({ where }),
    ]);

    return {
      data: psychologists,
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string) {
    const psy = await this.prisma.psychologist.findFirst({
      where: { id, status: 'APPROVED' },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        title: true,
        bio: true,
        specialties: true,
        languages: true,
        sessionRate: true,
        sessionDuration: true,
        averageRating: true,
        totalSessions: true,
        avatarUrl: true,
        yearsExperience: true,
        availabilitySlots: {
          where: { isActive: true },
          select: { dayOfWeek: true, startTime: true, endTime: true },
        },
        services: {
          where: { isActive: true },
          select: { id: true, name: true, description: true, price: true, durationMinutes: true, displayOrder: true },
          orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
        },
        reviews: {
          where: { isPublic: true, isVerified: true },
          select: {
            rating: true,
            comment: true,
            createdAt: true,
            patient: { select: { firstName: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!psy) throw new NotFoundException('Psychologue introuvable');
    return psy;
  }

  // ── Available time slots ─────────────────────────────────────────
  // Returns concrete datetime slots for the next N days

  async getAvailableSlots(psychologistId: string, fromDate: string, days = 14, serviceId?: string) {
    const psy = await this.prisma.psychologist.findFirst({
      where: { id: psychologistId, status: 'APPROVED' },
      include: {
        availabilitySlots: { where: { isActive: true } },
        blockedSlots: {
          where: {
            endsAt: { gte: new Date() },
          },
        },
      },
    });

    if (!psy) throw new NotFoundException('Psychologue introuvable');

    // Si un serviceId est passé, on utilise SA durée pour générer les créneaux.
    let duration = psy.sessionDuration; // fallback (valeur par défaut du psy)
    if (serviceId) {
      const svc = await this.prisma.service.findUnique({
        where: { id: serviceId },
        select: { psychologistId: true, durationMinutes: true, isActive: true },
      });
      if (!svc || svc.psychologistId !== psychologistId || !svc.isActive) {
        throw new NotFoundException('Prestation introuvable pour ce psy');
      }
      duration = svc.durationMinutes;
    }

    const timezone = psy.timezone;
    const startDate = parseISO(fromDate);
    const endDate = addDays(startDate, days);

    // Existing confirmed appointments in range (to exclude)
    const bookedSlots = await this.prisma.appointment.findMany({
      where: {
        psychologistId,
        status: { in: ['PENDING_PAYMENT', 'CONFIRMED', 'IN_PROGRESS'] },
        scheduledAt: { gte: startDate, lt: endDate },
      },
      select: { scheduledAt: true, durationMinutes: true },
    });

    const slots: { date: string; time: string; datetime: string }[] = [];

    for (let d = 0; d < days; d++) {
      const date = addDays(startDate, d);
      const dayOfWeek = getDay(date); // 0=Sun
      const daySlot = psy.availabilitySlots.find((s) => s.dayOfWeek === dayOfWeek);
      if (!daySlot) continue;

      // Generate slot times within the day window
      const [startH, startM] = daySlot.startTime.split(':').map(Number);
      const [endH, endM] = daySlot.endTime.split(':').map(Number);
      const dayStart = new Date(date);
      dayStart.setHours(startH, startM, 0, 0);
      const dayEnd = new Date(date);
      dayEnd.setHours(endH, endM, 0, 0);

      let cursor = new Date(dayStart);
      while (cursor < dayEnd) {
        const slotEnd = new Date(cursor.getTime() + duration * 60_000);
        if (slotEnd > dayEnd) break;

        // Check not in past
        if (cursor <= new Date()) { cursor = slotEnd; continue; }

        // Check not blocked
        const isBlocked = psy.blockedSlots.some((b) =>
          cursor >= b.startsAt && cursor < b.endsAt,
        );

        // Check not already booked
        const isBooked = bookedSlots.some((a) => {
          const aEnd = new Date(a.scheduledAt.getTime() + a.durationMinutes * 60_000);
          return cursor < aEnd && slotEnd > a.scheduledAt;
        });

        if (!isBlocked && !isBooked) {
          slots.push({
            date: format(date, 'yyyy-MM-dd'),
            time: format(cursor, 'HH:mm'),
            datetime: cursor.toISOString(),
          });
        }

        cursor = slotEnd;
      }
    }

    return slots;
  }

  // ── Psychologist dashboard ──────────────────────────────────────

  async getMyDashboard(userId: string) {
    const psy = await this.prisma.psychologist.findUnique({
      where: { userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        title: true,
        status: true,
        averageRating: true,
        totalSessions: true,
        sessionRate: true,
        sessionDuration: true,    // pour l'écran "Mes paramètres"
        yearsExperience: true,    // idem
        avatarUrl: true,
        bio: true,
        specialties: true,
        languages: true,
      },
    });
    if (!psy) throw new NotFoundException('Profil psychologue introuvable');

    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setHours(0, 0, 0, 0);
    startOfWeek.setDate(now.getDate() - now.getDay());
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 7);

    const [upcoming, weekCount, monthRevenue, patientCount, pendingReviews] =
      await this.prisma.$transaction([
        this.prisma.appointment.findMany({
          where: {
            psychologistId: psy.id,
            scheduledAt: { gte: now },
            status: { in: ['CONFIRMED', 'PENDING_PAYMENT', 'IN_PROGRESS'] },
          },
          include: {
            patient: { select: { firstName: true, lastName: true, avatarUrl: true } },
          },
          orderBy: { scheduledAt: 'asc' },
          take: 10,
        }),
        this.prisma.appointment.count({
          where: {
            psychologistId: psy.id,
            scheduledAt: { gte: startOfWeek, lt: endOfWeek },
            status: { in: ['CONFIRMED', 'COMPLETED', 'IN_PROGRESS'] },
          },
        }),
        this.prisma.payment.aggregate({
          where: {
            appointment: { psychologistId: psy.id },
            status: 'SUCCEEDED',
            createdAt: {
              gte: new Date(now.getFullYear(), now.getMonth(), 1),
            },
          },
          _sum: { psychologistPayout: true, amount: true },
        }),
        this.prisma.appointment.findMany({
          where: { psychologistId: psy.id, status: 'COMPLETED' },
          select: { patientId: true },
          distinct: ['patientId'],
        }),
        this.prisma.review.count({
          where: { psychologistId: psy.id },
        }),
      ]);

    return {
      psychologist: psy,
      stats: {
        weekAppointments: weekCount,
        monthRevenue: Number(monthRevenue._sum.psychologistPayout || monthRevenue._sum.amount || 0),
        totalPatients: patientCount.length,
        totalReviews: pendingReviews,
      },
      upcomingAppointments: upcoming,
    };
  }

  async getMyAppointments(userId: string, status?: string) {
    const psy = await this.prisma.psychologist.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!psy) throw new NotFoundException('Profil introuvable');

    const now = new Date();
    let where: any = { psychologistId: psy.id };
    if (status === 'upcoming') {
      where.scheduledAt = { gte: now };
      where.status = { in: ['CONFIRMED', 'PENDING_PAYMENT', 'IN_PROGRESS'] };
    } else if (status === 'past') {
      where.OR = [
        { scheduledAt: { lt: now } },
        { status: { in: ['COMPLETED', 'CANCELLED_BY_PATIENT', 'CANCELLED_BY_PSYCHOLOGIST', 'NO_SHOW'] } },
      ];
    }

    return this.prisma.appointment.findMany({
      where,
      include: {
        patient: {
          select: { firstName: true, lastName: true, avatarUrl: true, languages: true, issues: true },
        },
        payment: { select: { status: true, amount: true } },
      },
      orderBy: { scheduledAt: status === 'past' ? 'desc' : 'asc' },
      take: 100,
    });
  }

  async getMyPatients(userId: string) {
    const psy = await this.prisma.psychologist.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!psy) throw new NotFoundException('Profil introuvable');

    // Tous les RDV groupés par patient
    const appointments = await this.prisma.appointment.findMany({
      where: {
        psychologistId: psy.id,
        status: { in: ['CONFIRMED', 'COMPLETED', 'IN_PROGRESS'] },
      },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
            languages: true,
            issues: true,
          },
        },
      },
      orderBy: { scheduledAt: 'desc' },
    });

    // Group par patientId
    const byPatient = new Map<string, any>();
    const now = new Date();
    for (const apt of appointments) {
      const key = apt.patient.id;
      if (!byPatient.has(key)) {
        byPatient.set(key, {
          patient: apt.patient,
          totalSessions: 0,
          completedSessions: 0,
          lastSessionAt: null as Date | null,
          nextSessionAt: null as Date | null,
        });
      }
      const entry = byPatient.get(key);
      entry.totalSessions++;
      if (apt.status === 'COMPLETED') entry.completedSessions++;
      if (apt.scheduledAt < now && (!entry.lastSessionAt || apt.scheduledAt > entry.lastSessionAt)) {
        entry.lastSessionAt = apt.scheduledAt;
      }
      if (apt.scheduledAt >= now && (!entry.nextSessionAt || apt.scheduledAt < entry.nextSessionAt)) {
        entry.nextSessionAt = apt.scheduledAt;
      }
    }

    return Array.from(byPatient.values());
  }

  // ── Psychologist profile management ─────────────────────────────

  async updateProfile(userId: string, data: Partial<{
    bio: string;
    specialties: string[];
    languages: string[];
    sessionRate: number;
    sessionDuration: number;   // minutes
    timezone: string;
    yearsExperience: number;
    title: string;
  }>) {
    const psy = await this.prisma.psychologist.findUnique({ where: { userId } });
    if (!psy) throw new NotFoundException('Profil introuvable');

    // Garde-fous métier : pas de tarif négatif, durée raisonnable (15–180 min)
    if (data.sessionRate !== undefined && data.sessionRate < 0) {
      throw new Error('Le tarif ne peut pas être négatif');
    }
    if (data.sessionDuration !== undefined && (data.sessionDuration < 15 || data.sessionDuration > 180)) {
      throw new Error('La durée doit être comprise entre 15 et 180 minutes');
    }

    return this.prisma.psychologist.update({
      where: { userId },
      data,
    });
  }

  async setAvailability(userId: string, slots: Array<{
    dayOfWeek: number;
    startTime: string;
    endTime: string;
  }>) {
    const psy = await this.prisma.psychologist.findUnique({ where: { userId } });
    if (!psy) throw new NotFoundException('Profil introuvable');

    // Replace all slots
    await this.prisma.$transaction([
      this.prisma.availabilitySlot.deleteMany({ where: { psychologistId: psy.id } }),
      this.prisma.availabilitySlot.createMany({
        data: slots.map((s) => ({ ...s, psychologistId: psy.id })),
      }),
    ]);

    return { message: 'Disponibilités mises à jour' };
  }

  async addBlockedSlot(userId: string, startsAt: Date, endsAt: Date, reason?: string) {
    const psy = await this.prisma.psychologist.findUnique({ where: { userId } });
    if (!psy) throw new NotFoundException('Profil introuvable');
    if (startsAt >= endsAt) throw new BadRequestException('Dates invalides');

    return this.prisma.blockedSlot.create({
      data: { psychologistId: psy.id, startsAt, endsAt, reason },
    });
  }

  // ── Services / Prestations ──────────────────────────────────────
  // Chaque psy gère ses propres prestations (nom libre, tarif, durée).

  /** Public — liste des prestations actives d'un psy */
  async getServicesForPsy(psychologistId: string) {
    return this.prisma.service.findMany({
      where: { psychologistId, isActive: true },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /** Psy — liste de TOUTES ses prestations (y compris archivées) */
  async getMyServices(userId: string) {
    const psy = await this.prisma.psychologist.findUnique({ where: { userId }, select: { id: true } });
    if (!psy) throw new NotFoundException('Profil introuvable');
    return this.prisma.service.findMany({
      where: { psychologistId: psy.id },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

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

  async createMyService(userId: string, data: {
    name: string;
    description?: string;
    price: number;
    durationMinutes: number;
    displayOrder?: number;
  }) {
    const psy = await this.prisma.psychologist.findUnique({ where: { userId }, select: { id: true } });
    if (!psy) throw new NotFoundException('Profil introuvable');
    this.validateServiceData(data);

    // Plafond : 4 prestations max par psy (toutes incluses, actives ou non)
    const count = await this.prisma.service.count({ where: { psychologistId: psy.id } });
    if (count >= 4) {
      throw new BadRequestException('Vous avez atteint le maximum de 4 prestations. Supprimez-en une avant d\'en ajouter une nouvelle.');
    }

    return this.prisma.service.create({
      data: {
        psychologistId: psy.id,
        name: data.name.trim(),
        description: data.description?.trim() || null,
        price: data.price,
        durationMinutes: data.durationMinutes,
        displayOrder: data.displayOrder ?? 0,
      },
    });
  }

  async updateMyService(userId: string, serviceId: string, data: Partial<{
    name: string;
    description: string;
    price: number;
    durationMinutes: number;
    isActive: boolean;
    displayOrder: number;
  }>) {
    const psy = await this.prisma.psychologist.findUnique({ where: { userId }, select: { id: true } });
    if (!psy) throw new NotFoundException('Profil introuvable');

    const svc = await this.prisma.service.findUnique({ where: { id: serviceId } });
    if (!svc) throw new NotFoundException('Prestation introuvable');
    if (svc.psychologistId !== psy.id) throw new ForbiddenException('Cette prestation ne vous appartient pas');

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

  async deleteMyService(userId: string, serviceId: string) {
    const psy = await this.prisma.psychologist.findUnique({ where: { userId }, select: { id: true } });
    if (!psy) throw new NotFoundException('Profil introuvable');

    const svc = await this.prisma.service.findUnique({ where: { id: serviceId } });
    if (!svc) throw new NotFoundException('Prestation introuvable');
    if (svc.psychologistId !== psy.id) throw new ForbiddenException('Cette prestation ne vous appartient pas');

    // Suppression libre : les rendez-vous existants conservent un snapshot
    // (serviceName, durationMinutes, prix) sur l'Appointment → l'historique
    // n'est jamais perdu. La relation Appointment.serviceId passe à null via
    // SetNull défini dans le schéma Prisma.
    await this.prisma.service.delete({ where: { id: serviceId } });
    return { message: 'Prestation supprimée' };
  }
}
