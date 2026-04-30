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

  // ── Contenus du site (CMS) ──────────────────────────────────────
  // Upsert → safe à rejouer à chaque déploiement sans écraser les
  // modifications faites depuis l'admin.
  const siteContents = [
    // Page d'accueil
    { key: 'home.hero.badge',       label: 'Badge héro accueil',        page: 'home',        type: 'text',     value: 'Plateforme de téléconsultation' },
    { key: 'home.hero.title',       label: 'Titre héro accueil',        page: 'home',        type: 'text',     value: 'Votre psy, enfin accessible' },
    { key: 'home.hero.subtitle',    label: 'Sous-titre héro accueil',   page: 'home',        type: 'textarea', value: 'Des consultations psychologiques en ligne avec des thérapeutes arabophones, formés à la réalité culturelle de la diaspora maghrébine.' },
    { key: 'home.psys.badge',       label: 'Badge section psys',        page: 'home',        type: 'text',     value: 'Une équipe d\'exception' },
    { key: 'home.psys.title',       label: 'Titre section psys',        page: 'home',        type: 'text',     value: 'Des thérapeutes qui vous ressemblent' },
    { key: 'home.psys.subtitle',    label: 'Sous-titre section psys',   page: 'home',        type: 'textarea', value: 'Chacun de nos psychologues est diplômé, certifié et formé à la sensibilité culturelle maghrébine.' },
    { key: 'home.about.badge',      label: 'Badge section "Notre mission"', page: 'home',    type: 'text',     value: 'Notre mission' },
    { key: 'home.about.title',      label: 'Titre section mission',     page: 'home',        type: 'text',     value: 'La santé mentale n\'a pas de frontières' },
    { key: 'home.about.text',       label: 'Texte section mission',     page: 'home',        type: 'textarea', value: 'Nafsoléa est née d\'un constat : les personnes d\'origine maghrébine vivant en France peinent à trouver un espace de parole qui comprend leur double culture, leurs dilemmes familiaux, leur rapport à la honte et à la fierté.' },
    // Comment ça marche
    { key: 'howitworks.hero.title',    label: 'Titre héro "Comment ça marche"', page: 'howItWorks', type: 'text', value: 'Comment ça marche ?' },
    { key: 'howitworks.hero.subtitle', label: 'Sous-titre héro',              page: 'howItWorks', type: 'textarea', value: 'En 3 étapes simples, trouvez le thérapeute qu\'il vous faut et commencez votre suivi.' },
    { key: 'howitworks.step1.title',   label: 'Étape 1 — titre',             page: 'howItWorks', type: 'text', value: 'Choisissez votre thérapeute' },
    { key: 'howitworks.step1.text',    label: 'Étape 1 — texte',             page: 'howItWorks', type: 'textarea', value: 'Parcourez nos profils et filtrez par langue, spécialité ou tarif. Chaque profil détaille la formation, l\'approche et les créneaux disponibles.' },
    { key: 'howitworks.step2.title',   label: 'Étape 2 — titre',             page: 'howItWorks', type: 'text', value: 'Réservez en quelques clics' },
    { key: 'howitworks.step2.text',    label: 'Étape 2 — texte',             page: 'howItWorks', type: 'textarea', value: 'Choisissez un créneau, renseignez vos informations et réglez en ligne. Votre place est confirmée immédiatement.' },
    { key: 'howitworks.step3.title',   label: 'Étape 3 — titre',             page: 'howItWorks', type: 'text', value: 'Consultez depuis chez vous' },
    { key: 'howitworks.step3.text',    label: 'Étape 3 — texte',             page: 'howItWorks', type: 'textarea', value: 'Rejoignez votre séance en vidéo via notre plateforme sécurisée. Aucun logiciel à installer.' },
    // Nos psychologues
    { key: 'psychologues.hero.title',    label: 'Titre page psychologues',     page: 'psychologues', type: 'text', value: 'Nos psychologues' },
    { key: 'psychologues.hero.subtitle', label: 'Sous-titre page psychologues', page: 'psychologues', type: 'textarea', value: 'Des thérapeutes certifiés, bilingues et formés à la réalité de la diaspora maghrébine.' },
    // À propos
    { key: 'about.hero.title',       label: 'Titre héro "À propos"',     page: 'about',       type: 'text',     value: 'À propos de Nafsoléa' },
    { key: 'about.hero.subtitle',    label: 'Sous-titre héro à propos',  page: 'about',       type: 'textarea', value: 'Une plateforme née du désir de rendre la santé mentale accessible à toutes les femmes de la diaspora maghrébine.' },
    { key: 'about.mission.title',    label: 'Titre section mission',     page: 'about',       type: 'text',     value: 'Notre mission' },
    { key: 'about.mission.text',     label: 'Texte mission',             page: 'about',       type: 'textarea', value: 'Nafsoléa croit que chaque femme mérite un espace de parole sécurisé, culturellement adapté, sans jugement. Notre mission est de briser les tabous autour de la santé mentale dans les communautés maghrébines.' },
    // FAQ
    { key: 'faq.hero.title',         label: 'Titre page FAQ',            page: 'faq',         type: 'text',     value: 'Questions fréquentes' },
    { key: 'faq.hero.subtitle',      label: 'Sous-titre FAQ',            page: 'faq',         type: 'textarea', value: 'Tout ce que vous devez savoir avant de commencer.' },
    // Général
    { key: 'global.tagline',         label: 'Tagline globale (footer)',  page: 'global',      type: 'text',     value: 'La santé mentale pour la diaspora maghrébine.' },
  ];

  for (const item of siteContents) {
    await prisma.siteContent.upsert({
      where: { key: item.key },
      update: { label: item.label, page: item.page, type: item.type },
      // On ne met pas `value` dans `update` pour ne pas écraser les modifs admin
      create: item,
    });
  }
  console.log(`✅ Contenus du site initialisés (${siteContents.length} entrées)`);

  console.log('\n🎉 Seed complete!');
  console.log('   Admin:    admin@nafsolea.com   / Admin1234!');
  console.log('   Patient:  patient@example.com  / Patient1!');
  console.log('   Psy:      sarah.benzara@nafsolea.com / Psy12345!');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
