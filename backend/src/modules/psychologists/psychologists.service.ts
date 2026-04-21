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

  async getAvailableSlots(psychologistId: string, fromDate: string, days = 14) {
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

    const timezone = psy.timezone;
    const duration = psy.sessionDuration; // minutes
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

  // ── Psychologist profile management ─────────────────────────────

  async updateProfile(userId: string, data: Partial<{
    bio: string;
    specialties: string[];
    languages: string[];
    sessionRate: number;
    timezone: string;
    yearsExperience: number;
  }>) {
    const psy = await this.prisma.psychologist.findUnique({ where: { userId } });
    if (!psy) throw new NotFoundException('Profil introuvable');

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
}
