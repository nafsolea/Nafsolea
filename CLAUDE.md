# CLAUDE.md — Contexte projet Nafsoléa

> Lis CE fichier en PRIORITÉ avant toute action sur ce repo. Il évite de re-explorer le code à chaque nouvelle session.

## 1. Le projet en une phrase

**Nafsoléa** = plateforme de téléconsultation de psychologues spécialisée pour la diaspora maghrébine (français / arabe / kabyle / darja). Patiente cible : femmes maghrébines (FR + Maghreb) ayant besoin d'un suivi psy culturellement adapté.

## 2. L'utilisatrice

- **Sarah** (sarahbentounes@gmail.com) — fondatrice, **non-technique**.
- Parle français. Réponds en français.
- Veut des explications simples + commandes git prêtes à copier/coller.
- Ne sait pas lire du code → ne JAMAIS la noyer dans des extraits de code, lui donner les diffs visibles dans son IDE et un récap.

## 3. Stack

| Couche       | Techno                                                                     |
| ------------ | -------------------------------------------------------------------------- |
| Frontend     | HTML / CSS / Vanilla JS (PAS de framework). Hébergé sur **Netlify**.       |
| Backend API  | **NestJS 10** + TypeScript. Hébergé sur **Render** (Docker, plan free).    |
| Base données | **PostgreSQL** sur **Neon** (serverless, plan free).                       |
| Cache/Queue  | **Redis** sur **Upstash** (utilisé pour Bull queues — peu critique).       |
| ORM          | **Prisma 5.22**. Schéma : `backend/prisma/schema.prisma`.                  |
| Auth         | JWT (access + refresh) via Passport.js + bcrypt.                           |
| Visio        | **Daily.co** (rooms éphémères créées au moment du booking).                |
| Paiement     | **Stripe Connect** (split psy / plateforme). Mode TEST en bêta.            |
| Email        | **SendGrid** via Nodemailer. **Placeholder = DRY RUN** (logs seulement).   |
| Storage      | AWS S3 (placeholder en bêta — uploads stockés en data URL pour l'instant). |

## 4. URLs de prod

- Frontend : `https://unrivaled-cactus-c3b6f5.netlify.app`
- Backend  : `https://nafsolea-api.onrender.com` (préfixe API : `/api/v1`)
- Repo Git : sur GitHub (Sarah pousse depuis son poste, déploiement auto Netlify + Render).

⚠️ **Render free tier = cold start ~30 s** sur le 1er appel. Normal.

## 5. Layout du repo

```
nafsolea/
├── *.html                  # pages publiques + patient (racine)
├── admin/*.html            # back-office admin
├── assets/
│   ├── css/style.css       # styles principaux (variables CSS, ~3500 lignes)
│   ├── css/admin.css       # styles back-office
│   ├── js/api.js           # CLIENT API → toujours passer par window.API
│   ├── js/auth.js          # session, tokens, redirects
│   ├── js/main.js          # menu, observeReveals, toasts, modal global
│   └── js/admin-ui.js      # sidebar admin
├── backend/
│   ├── prisma/schema.prisma
│   ├── prisma/seed.ts      # ⚠️ tourne à CHAQUE deploy (Dockerfile CMD)
│   ├── src/main.ts         # bootstrap NestJS
│   ├── src/app.module.ts
│   ├── src/modules/
│   │   ├── auth/           # login, register, refresh, verify-email, reset
│   │   ├── users/          # /users/me, avatars, notifications
│   │   ├── psychologists/  # listing public, dashboard psy, dispos, services
│   │   ├── appointments/   # booking, cancel, vidéo, review, crons
│   │   ├── payments/       # Stripe PaymentIntent + webhook
│   │   ├── video/          # Daily.co rooms + tokens
│   │   ├── notes/          # notes consultation chiffrées AES-256-GCM
│   │   ├── articles/       # CMS blog
│   │   ├── newsletter/     # subscribers + campaigns
│   │   ├── notifications/  # SendGrid wrapper (DRY RUN si placeholder)
│   │   └── admin/          # dashboard, validation psy, suspension users
│   └── Dockerfile          # CMD = prisma db push + seed + node dist/main
├── render.yaml             # blueprint Render
├── netlify.toml            # config Netlify
└── DEPLOIEMENT.md / FIXES-*.md  # docs historiques pour Sarah
```

## 6. Conventions IMPORTANTES

### Couleurs / variables CSS (dans `assets/css/style.css`)

```
--navy:#1a2b4a   --blue:#4a6b8a   --rose:#d4a5a5   --sage:#8fa896
--cream:#faf6f1  --beige:#e8ddd0  --border:#e0d6c8
```

Le footer DOIT rester rose/navy gradient (Sarah a explicitement râlé qu'il était moche → corrigé section 31.5 du CSS).

### Animations reveal

`.reveal { opacity:0 }` + `.reveal.visible { opacity:1 }`. Activé par un IntersectionObserver dans `main.js`.

⚠️ **PIÈGE classique** : si tu injectes des `.reveal` dynamiquement (cards psys, articles…), il FAUT appeler `window.observeReveals(rootElement)` après l'`innerHTML = ...`, sinon les éléments restent invisibles. Sarah a déjà été cassée par ce bug deux fois.

### Langues du psy (enum côté front)

Valeurs autorisées **désormais** : `fr`, `en`, `kabyle`, `darja`.

Anciennes valeurs en base (`ar`, `darija`) sont gardées en lecture pour compat (les maps d'affichage dans `psychologues.html`, `psychologue-detail.html`, `rendez-vous.html` les traduisent encore). Mais les inputs ne proposent plus que les 4 nouvelles.

### Décimales pour les prix

Les `<input type="number">` de tarif utilisent `step="0.01"` + `inputmode="decimal"`. La saisie passe par `parseFloat(String(v).replace(',', '.'))` pour accepter virgule ET point.

Affichage : `Number(price).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' €'`.

### Client API (`assets/js/api.js`)

Toujours passer par `window.API`. Singleton qui :

- détecte localhost vs prod (override possible avec `window.NAFSOLEA_API_URL`)
- gère le silent refresh sur 401
- expose `auth.*`, `users.*`, `psychologists.*`, `appointments.*`, `payments.*`, `articles.*`, `newsletter.*`, `admin.*`

Exemple : `await API.psychologists.list({ language: 'fr' })`.

### Auth front (`assets/js/auth.js`)

- `Auth.getAccessToken()` / `Auth.getRefreshToken()` / `Auth.silentRefresh()` / `Auth.clearSession()` / `Auth.redirectToLogin()`.
- Tokens stockés en `localStorage` (à durcir post-bêta).

### Toasts

`window.toast(message, 'success'|'error'|'info')` — défini dans `main.js`. À utiliser plutôt que `alert()`.

## 7. Modèles Prisma (résumé)

```
User (PATIENT|PSYCHOLOGIST|ADMIN) — 1:1 → Patient OU Psychologist
Patient — appointments, payments, reviews
Psychologist — sessionRate (Decimal), sessionDuration (default), status (PENDING|APPROVED|REJECTED|SUSPENDED)
              → AvailabilitySlot[] (récurrence hebdo)
              → BlockedSlot[] (vacances)
              → Service[]  ← AJOUTÉ : prestations multiples par psy (cf §10)
              → Appointment[], Review[], ConsultationNote[]
Service — psychologistId, name (libre), price (Decimal), durationMinutes,
          isActive, displayOrder. Cascade delete avec le psy.
Appointment — scheduledAt, durationMinutes (snapshot), status,
              serviceId? + serviceName? (snapshot, ajoutés récemment)
              → Payment 1:1, ConsultationNote? 1:1, Review? 1:1
Payment — Stripe PI, amount, platformFee, psychologistPayout, refund fields
ConsultationNote — contentEncrypted (AES-256-GCM, IV + authTag séparés)
Review — rating 1-5, isPublic (patient choisit)
Article (DRAFT|PUBLISHED) — CMS blog interne
NewsletterSubscriber + NewsletterCampaign
RefreshToken (rotation), Notification, AuditLog
```

## 8. Endpoints clés

Préfixe : `/api/v1`

**Public** : `GET /articles`, `/articles/:slug`, `/articles/categories`, `/psychologists`, `/psychologists/:id`, `/psychologists/:id/slots?from=&days=&serviceId=`, `/psychologists/:id/services`, `/newsletter/subscribe`, `/auth/login`, `/auth/register`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/verify-email`.

**Patient** : `/users/me`, `/users/me/appointments`, `/users/me/notifications`, `/appointments` (POST = book avec serviceId), `/appointments/:id` (DELETE), `/appointments/:id/video`, `/appointments/:id/review`.

**Psy** : `/psychologists/me/dashboard`, `/me/appointments`, `/me/patients`, `/me/profile` (PUT), `/me/availability`, `/me/blocked-slots`, `/me/services` (GET/POST/PUT/DELETE).

**Admin** : `/admin/dashboard`, `/admin/psychologists/pending`, `/admin/psychologists/:id` (PUT global), `/admin/psychologists/:id/services` (CRUD), `/admin/psychologists/:id/approve|reject`, `/admin/users`, `/admin/users/:id/suspend`, `/admin/users/:id/verify-email`, `/admin/appointments`, `/admin/revenue`, `/admin/audit-logs`, `/newsletter/admin/*`, `/articles/admin/*`.

## 9. Variables d'environnement (Render)

Dans `render.yaml`. Celles à `sync: false` sont à remplir manuellement dans le dashboard Render :

- `DATABASE_URL` (Neon)
- `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` (Upstash)
- `FRONTEND_URL` (Netlify)
- Flags bêta : `BETA_AUTO_VERIFY_EMAIL=false`, `BETA_AUTO_APPROVE_PSY=false` (admin doit valider à la main).

Placeholders restants en bêta : Stripe (sk_test_placeholder…), Daily.co, SendGrid (`SG.placeholder…`), AWS S3.

→ Si SendGrid est en placeholder, **les emails ne partent pas** (DRY RUN logs côté serveur). L'admin peut valider manuellement les emails via `/admin/utilisateurs.html` (bouton "Valider email").

## 10. Feature en cours : Services / Prestations (lot 4)

Sarah a demandé que chaque psy puisse définir **plusieurs prestations** (ex: "Consultation individuelle 60min 70€", "Thérapie de couple 90min 110€", "1ère consult 45min 50€"). Décisions validées avec elle :

1. **Liste libre** : le psy tape lui-même le nom (pas de catalogue prédéfini).
2. **Migration auto** : pour chaque psy existant avec `sessionRate > 0`, créer auto une "Consultation individuelle" avec ses tarif/durée actuels (logique idempotente dans `seed.ts`).
3. **Booking** : le patient choisit la prestation **AVANT** le créneau (la durée varie → les créneaux changent).

### État au moment où je t'écris

✅ **Fait** :

- Schéma Prisma : modèle `Service` ajouté + relation sur `Psychologist` + `serviceId`/`serviceName` ajoutés sur `Appointment`.
- Seed : backfill auto "Consultation individuelle" pour les psys sans services.
- Backend `psychologists.service.ts` : CRUD `/me/services` + `getServicesForPsy(id)` + `findAll`/`findOne` retournent les services + `getAvailableSlots(...,serviceId)` utilise la durée du service.
- Backend `psychologists.controller.ts` : endpoints publics `/psychologists/:id/services`, psy `/me/services` (GET/POST/PUT/DELETE), `/slots?serviceId=`.
- Backend `admin.service.ts` + `admin.controller.ts` : endpoints `/admin/psychologists/:id/services` (GET/POST/PUT/DELETE).
- Backend `appointments.service.ts` : `book()` accepte `serviceId` optionnel ; si le psy a au moins 1 service actif, le serviceId est OBLIGATOIRE ; snapshot prix+durée+nom ; fallback sessionRate/sessionDuration sinon.

❌ **À FAIRE** (reprends ici) :

1. `appointments.controller.ts` : ajouter `serviceId` dans le body du POST (et passer à `service.book()`).
2. `assets/js/api.js` :
   - `psychologists.getServices(id)` → `GET /psychologists/:id/services`
   - `psychologists.myServices()` / `createService(data)` / `updateService(id, data)` / `deleteService(id)`
   - `psychologists.getSlots(id, from, days, serviceId?)` — ajouter le param
   - `appointments.book({ psychologistId, scheduledAt, serviceId, notes })` — ajouter serviceId
   - `admin.listServices(psyId)` / `createService(psyId, data)` / `updateService(psyId, sid, data)` / `deleteService(psyId, sid)`
3. `mon-cabinet.html` : section "Mes prestations" avec liste + bouton + modale d'édition.
4. `admin/psychologues.html` : dans le modal d'édition, gérer la liste de prestations.
5. `psychologue-detail.html` : afficher la liste de prestations dans la sidebar (au lieu du seul `sessionRate` global).
6. `psychologues.html` (listing) : afficher "à partir de X €" en se basant sur `min(services.price)`.
7. `rendez-vous.html` : nouvelle étape "Choix prestation" → recharge les slots avec `?serviceId=` → POST avec serviceId.
8. Faire le récap déploiement + commandes git pour Sarah.

### Migration en prod (rappel pour Sarah)

`prisma db push` tourne **automatiquement** au démarrage du conteneur Render (cf `Dockerfile` CMD). Le seed aussi. Donc le push git suffit, pas de commande manuelle Prisma à lancer.

## 11. Pièges connus / gotchas

1. **Footer rose** : si le CSS du footer disparaît, Sarah le remarque IMMÉDIATEMENT. Section 31.5 de `style.css`.
2. **observeReveals** : voir §6 — toujours rappeler après injection HTML dynamique.
3. **Compat langues** : ne pas supprimer les entrées `ar` / `darija` des maps de display, juste des inputs.
4. **Render cold start** : la 1ère requête prend ~30s. Ne pas conclure trop vite que c'est cassé.
5. **Email DRY RUN** : tant que `SENDGRID_API_KEY` commence par `SG.placeholder`, aucun mail ne part. C'est logué côté serveur en `[DRY RUN]`. Sarah a tendance à dire "ça ne marche pas" → vérifier les logs Render avant.
6. **Admin doit approuver les psys** : `BETA_AUTO_APPROVE_PSY=false`. Un psy inscrit reste en `PENDING` tant que l'admin ne clique pas sur ✅ dans `admin/psychologues.html`.
7. **`/admin/utilisateurs.html`** est filtré sur PATIENT par défaut (Sarah s'attendait à ne voir que les patients ici).
8. **Décimales** : voir §6, ne PAS remettre `step="5"` ou `step="1"` sur les inputs de prix.
9. **Photo de profil** : limite body NestJS étendue (cf fix #24). Stocké en data URL pour l'instant.
10. **Comptes seed** : `admin@nafsolea.com / Admin1234!` · `sarah.benzara@nafsolea.com / Psy12345!` · `patient@example.com / Patient1!`.

## 12. Workflow Git pour Sarah

À chaque batch de changements, je dois lui donner :

```bash
git add .
git commit -m "<message court en français>"
git push
```

Et un plan de test concis (3-4 étapes max), en français.

## 13. Style de réponse à adopter

- Français.
- **Pas de jargon** technique gratuit. Si je dois introduire un terme tech, je l'explique en une phrase.
- **Pas d'emoji** sauf si elle en met d'abord.
- Concis. Sarah préfère 5 lignes claires à 30 lignes exhaustives.
- Quand je modifie plusieurs fichiers, je liste à la fin **où** chaque changement s'est passé en une ligne par fichier.
- Pour les bugs, lui demander 3 infos max : (1) URL où elle voit le bug, (2) ce qu'elle voit vs ce qu'elle attend, (3) un copier-coller des erreurs console / network si elle sait faire (sinon screenshot).

## 14. Tâches longues / multi-étapes

Toujours utiliser `TaskCreate` / `TaskUpdate` pour donner une visibilité de la progression. Sarah voit les tâches dans son UI Cowork.
