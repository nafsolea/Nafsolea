/**
 * Database seed — creates an admin account + sample approved psychologist.
 * Run with: npm run db:seed
 */
import { PrismaClient, UserRole, PsychologistStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database…');

  // ── Admin account ────────────────────────────────────────────────
  const adminPassword = await bcrypt.hash('Admin1234!', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@nafsolea.com' },
    update: {},
    create: {
      email: 'admin@nafsolea.com',
      passwordHash: adminPassword,
      role: UserRole.ADMIN,
      emailVerifiedAt: new Date(),
    },
  });
  console.log(`✅ Admin created: ${admin.email}`);

  // ── Sample psychologist ──────────────────────────────────────────
  const psyPassword = await bcrypt.hash('Psy12345!', 12);
  const psyUser = await prisma.user.upsert({
    where: { email: 'sarah.benzara@nafsolea.com' },
    update: {},
    create: {
      email: 'sarah.benzara@nafsolea.com',
      passwordHash: psyPassword,
      role: UserRole.PSYCHOLOGIST,
      emailVerifiedAt: new Date(),
    },
  });

  const psy = await prisma.psychologist.upsert({
    where: { userId: psyUser.id },
    update: {},
    create: {
      userId: psyUser.id,
      firstName: 'Sarah',
      lastName: 'Benzara',
      title: 'Psychologue clinicienne',
      bio: 'Spécialisée dans l\'accompagnement des expatriés maghrébins, les troubles anxieux et le deuil interculturel. 8 ans d\'expérience.',
      specialties: ['anxiety', 'trauma', 'immigration_stress', 'grief'],
      languages: ['fr', 'ar', 'en'],
      sessionRate: 65,
      sessionDuration: 60,
      status: PsychologistStatus.APPROVED,
      approvedAt: new Date(),
      yearsExperience: 8,
      timezone: 'Europe/Paris',
    },
  });

  // Weekly availability: Mon-Fri 09:00–18:00
  await prisma.availabilitySlot.deleteMany({ where: { psychologistId: psy.id } });
  await prisma.availabilitySlot.createMany({
    data: [1, 2, 3, 4, 5].map((day) => ({
      psychologistId: psy.id,
      dayOfWeek: day,
      startTime: '09:00',
      endTime: '18:00',
    })),
  });

  console.log(`✅ Psychologist created: ${psy.firstName} ${psy.lastName}`);

  // ── Sample patient ───────────────────────────────────────────────
  const patientPassword = await bcrypt.hash('Patient1!', 12);
  const patientUser = await prisma.user.upsert({
    where: { email: 'patient@example.com' },
    update: {},
    create: {
      email: 'patient@example.com',
      passwordHash: patientPassword,
      role: UserRole.PATIENT,
      emailVerifiedAt: new Date(),
    },
  });

  await prisma.patient.upsert({
    where: { userId: patientUser.id },
    update: {},
    create: {
      userId: patientUser.id,
      firstName: 'Karim',
      lastName: 'Hadj',
      languages: ['fr', 'ar'],
      preferredLanguage: 'fr',
      timezone: 'Europe/Paris',
      issues: ['anxiety', 'immigration_stress'],
      gdprConsentAt: new Date(),
    },
  });

  console.log(`✅ Patient created: patient@example.com`);

  // ── Migration : prestations par défaut ───────────────────────────
  // Pour chaque psy qui n'a encore AUCUN service, on crée une
  // prestation par défaut "Consultation individuelle" à partir de
  // ses sessionRate / sessionDuration actuels. Idempotent : se
  // rejoue sans effet si le psy a déjà des services.
  const psysWithoutServices = await prisma.psychologist.findMany({
    where: { services: { none: {} } },
    select: { id: true, firstName: true, sessionRate: true, sessionDuration: true },
  });
  for (const p of psysWithoutServices) {
    const rate = Number(p.sessionRate || 0);
    if (rate <= 0) continue; // on ne crée pas de prestation à 0 €
    await prisma.service.create({
      data: {
        psychologistId: p.id,
        name: 'Consultation individuelle',
        description: null,
        price: p.sessionRate,
        durationMinutes: p.sessionDuration,
        isActive: true,
        displayOrder: 0,
      },
    });
  }
  if (psysWithoutServices.length > 0) {
    console.log(`✅ Prestations par défaut créées pour ${psysWithoutServices.length} psy(s)`);
  }

  console.log('\n🎉 Seed complete!');
  console.log('   Admin:    admin@nafsolea.com   / Admin1234!');
  console.log('   Patient:  patient@example.com  / Patient1!');
  console.log('   Psy:      sarah.benzara@nafsolea.com / Psy12345!');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
