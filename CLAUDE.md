# CLAUDE.md — Contexte projet Nafsoléa

> Lis CE fichier en PRIORITÉ avant toute action sur ce repo. Il évite de re-explorer le code à chaque nouvelle session.
>
> **Dernière mise à jour : 29 avril 2026 (fin de soirée)**. Avant toute affirmation du genre « c'est déjà fait », vérifier dans le code ou via `git log --oneline -20`. Voir §11 piège n°12.

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

## 10. État du chantier (mis à jour 29 avril 2026 fin de soirée)

### Lot 4 — Prestations multiples ✅ TERMINÉ ET DÉPLOYÉ

Chaque psy peut définir **jusqu'à 4 prestations** (ex: "Consultation individuelle 60min 70€", "Thérapie de couple 90min 110€", "1ère consult 45min 50€").

Décisions validées avec Sarah et appliquées :
- Nom libre (pas de catalogue prédéfini), description optionnelle (max 200 caractères)
- Plafond serveur 4 prestations / psy
- Suppression libre (le snapshot `serviceName` + `durationMinutes` + prix sur l'`Appointment` protège l'historique)
- `Appointment.service` en `onDelete: SetNull` côté Prisma
- Backfill auto "Consultation individuelle" dans `seed.ts` pour les psys legacy (idempotent)
- Booking : si le psy a ≥1 prestation, le serviceId est obligatoire ; sinon fallback `sessionRate`/`sessionDuration` (rétro-compat)

UI livrée :
- `mon-cabinet.html` → onglet **« Mes prestations »** (CRUD complet, modale)
- `admin/psychologues.html` → bloc « Prestations » dans le modal d'édition de psy (création/suppression instantanées, modifications batchées au save global)
- `psychologue-detail.html` → cartes prestations cliquables dans la sidebar (cliquer présélectionne la prestation au booking)
- `psychologues.html` → « dès X € · N prestations » sur les cards
- `rendez-vous.html` → étape « Choix prestation » dans le step 1 (skip auto si 1 seule, requise si plusieurs)

### Lot 5 — Éditeur de disponibilités hebdomadaires ✅ TERMINÉ ET DÉPLOYÉ

Chaque psy peut configurer ses créneaux hebdo via `mon-cabinet.html` → onglet **« Mes disponibilités »** :
- 7 jours (Lun → Dim, ordre français)
- Plages multiples par jour (matin / après-midi / soir, sans limite)
- Validation front : durée min 30 min + pas de chevauchements dans le même jour
- Replace-all côté serveur (delete + createMany dans une transaction)
- Endpoint `GET /psychologists/me/availability` ajouté

⚠️ **Important — fix backend** : `getAvailableSlots` utilisait `find()` (une seule plage par jour) → réécrit avec `filter()` + boucle. Si on revient dessus, ne pas régresser.

**Pas d'éditeur de dispos côté admin** dans cette session — le psy fait ça lui-même. À ajouter si demande explicite plus tard.

### Bug calendrier de booking ✅ FIXÉ

Les flèches ‹ › du calendrier dans `rendez-vous.html` n'étaient pas câblées (mock statique). Maintenant :
- État `displayedMonth = { year, month }` séparé du mois courant
- Navigation entre mois avec garde-fous (pas avant le mois courant, pas au-delà de `MAX_MONTHS_AHEAD = 3`)
- `loadSlots()` charge maintenant 90 jours d'un coup → pas d'appel réseau supplémentaire à la navigation
- Boutons grisés visuellement quand on atteint une limite

### UX booking pour patientes connectées ✅ FAIT

`rendez-vous.html` étape 3 : si la patiente est connectée, on cache prénom/nom/email/tel/pays (pré-remplis) et on affiche un bandeau sage **« ✓ [Nom Prénom] · [email] · Changer de compte »**. Reste visible : motif (optionnel) + case CGU. Si pas connectée : formulaire complet comme avant.

### 🚧 BLOQUANT POUR LA PROCHAINE SESSION : Stripe en placeholder

Toute tentative de réservation plante en 500 avec :
```
Invalid API Key provided: sk_test_******************e_me
```

La variable `STRIPE_SECRET_KEY` sur Render contient encore `sk_test_replace_me`. Sarah doit :
1. Aller sur dashboard.stripe.com (vérifier mode **Test** en haut à droite)
2. Developers → API keys → copier la `sk_test_...` (Reveal test key)
3. dashboard.render.com → service `nafsolea-api` → Environment → modifier `STRIPE_SECRET_KEY` → Save → Render redémarre tout seul

Au passage, vérifier aussi `STRIPE_WEBHOOK_SECRET` (pas bloquant pour un booking simple, mais pour les webhooks de paiement). La carte de test Stripe = `4242 4242 4242 4242`, n'importe quelle CVC, n'importe quelle date future.

### Notes utiles pour les sessions futures

- **Migration en prod** : `prisma db push` + seed tournent automatiquement au démarrage du conteneur Render (cf `Dockerfile` CMD). Pas de commande manuelle Prisma à lancer après un push.
- **Cold start Render** : le 1er appel après inactivité prend ~30s. Normal sur le free tier.
- **Netlify free tier** a des limites de minutes de build par mois. Sarah a déjà payé une fois (avril 2026). Pour économiser, le frontend étant 100% statique on peut toujours désactiver le build Netlify si besoin.

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

11. **🆕 Ordre des routes NestJS** : dans un même contrôleur, **toutes les routes `me/...` DOIVENT être déclarées AVANT les routes `:id/...`** ayant le même nombre de segments. Sinon NestJS matche `:id = "me"` et la route `me/xxx` devient un 404 fantôme. On a déjà eu le bug 2 fois (sur `me/services` et failli sur `me/availability`). Voir le commentaire d'avertissement en haut de `psychologists.controller.ts`.

12. **🆕 CLAUDE.md ment parfois** : à plusieurs reprises, ce fichier disait « ✅ Fait » pour du code qui n'avait jamais été poussé sur GitHub (ex: signature `book(serviceId)` dans `appointments.service.ts`, routes admin/services). **Toujours vérifier avec un grep ou un git log** plutôt que faire confiance aveuglément à la doc. Les builds Render échouent sinon.

13. **🆕 Multi-plages par jour** : le backend supporte plusieurs `availabilitySlot` avec le même `dayOfWeek` (contrainte unique = `psychologistId + dayOfWeek + startTime`, pas juste `dayOfWeek`). `getAvailableSlots` boucle sur **toutes** les plages d'un jour. Ne pas régresser en revenant à `find()`.

14. **🆕 Top 50 psys dans le booking** : `rendez-vous.html` charge `API.psychologists.list({ limit: 50 })`. Si un psy n'est pas dans les 50 (peu probable en bêta mais à long terme oui), le code fait un `getOne(id)` individuel pour le récupérer. Voir le `init()` de la page.

15. **🆕 Race condition booking** : `selectPsy()` est `async` (charge les services). Le bouton « Choisir un créneau → » est désactivé pendant ce chargement pour éviter qu'on saute à l'étape 2 avant que `psyServices` soit hydraté.

16. **🆕 Stripe en placeholder** : voir §10 — bloquant pour toute réservation. À fixer dès la prochaine session si Sarah veut tester un booking de bout en bout.

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
