/**
 * Consultation Notes — psychologist-only, AES-256-GCM encrypted.
 * Patients CANNOT access their psychologist's notes.
 * Notes are only decrypted in memory, never stored in plaintext.
 */
import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { encrypt, decrypt } from '../../common/utils/encryption';

@Injectable()
export class NotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private get encryptionKey(): string {
    return this.config.get<string>('encryption.key')!;
  }

  async upsertNote(psychologistUserId: string, appointmentId: string, content: string) {
    // Verify psychologist owns this appointment
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: { psychologist: { select: { userId: true } } },
    });

    if (!appointment) throw new NotFoundException('Rendez-vous introuvable');
    if (appointment.psychologist.userId !== psychologistUserId) throw new ForbiddenException();

    const { ciphertext, iv, authTag } = encrypt(content, this.encryptionKey);

    await this.prisma.consultationNote.upsert({
      where: { appointmentId },
      create: {
        appointmentId,
        psychologistId: appointment.psychologistId,
        contentEncrypted: ciphertext,
        iv,
        authTag,
      },
      update: {
        contentEncrypted: ciphertext,
        iv,
        authTag,
      },
    });

    return { message: 'Note sauvegardée' };
  }

  async getNote(psychologistUserId: string, appointmentId: string) {
    const note = await this.prisma.consultationNote.findUnique({
      where: { appointmentId },
      include: { psychologist: { select: { userId: true } } },
    });

    if (!note) throw new NotFoundException('Aucune note pour cette séance');
    if (note.psychologist.userId !== psychologistUserId) throw new ForbiddenException();

    const content = decrypt(note.contentEncrypted, note.iv, note.authTag, this.encryptionKey);

    return {
      appointmentId,
      content,
      updatedAt: note.updatedAt,
    };
  }
}
