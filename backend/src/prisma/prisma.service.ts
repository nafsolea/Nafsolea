import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'stdout', level: 'error' },
        { emit: 'stdout', level: 'warn' },
      ],
    });
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Database connection established');
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  // Soft-delete helper: anonymize patient data for RGPD right-to-erasure
  async anonymizePatient(patientId: string): Promise<void> {
    await this.$transaction([
      this.patient.update({
        where: { id: patientId },
        data: {
          firstName: 'Anonyme',
          lastName: 'Anonyme',
          dateOfBirth: null,
          phone: null,
          avatarUrl: null,
          anonymizedAt: new Date(),
        },
      }),
      this.user.update({
        where: { patient: { id: patientId } },
        data: {
          email: `deleted_${patientId}@nafsolea.invalid`,
          isActive: false,
        },
      }),
    ]);
  }
}
