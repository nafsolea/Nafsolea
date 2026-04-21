# Nafsoléa — Guide de déploiement en ligne (Phase 1 : Bêta)

Ce guide t'amène de ton ordinateur à un site public en ligne. Tout est **gratuit**. Chaque étape prend 2–10 minutes.

> **Important** — Cette Phase 1 déploie une version **bêta** (démo publique, pas de vrais patients). Voir la Phase 2 en bas du document pour passer en production HDS.

---

## Aperçu de l'infrastructure

| Brique | Service | Coût | Rôle |
|---|---|---|---|
| Base de données | **Neon** (Postgres) | Gratuit | Stocke utilisateurs, rendez-vous, articles |
| Files d'attente | **Upstash** (Redis) | Gratuit | Rappels de rendez-vous |
| Backend API | **Render** | Gratuit | Logique métier (NestJS) |
| Frontend | **Netlify** | Gratuit | Pages HTML/CSS/JS |
| Code source | **GitHub** | Gratuit | Sauvegarde + déploiement auto |

Temps total : **~60 minutes** si tu n'as aucun compte, **~20 minutes** si tu as déjà GitHub.

---

## Étape 0 — Pousser le code sur GitHub

### 0.1. Crée un dépôt GitHub

1. Va sur https://github.com/new
2. Nom du dépôt : `nafsolea`
3. Visibilité : **Private** (recommandé, puisque le code contient la logique métier)
4. **Ne coche pas** "Initialize with README"
5. Clique **Create repository**
6. GitHub t'affiche deux liens — garde la ligne qui commence par `git@github.com:...` ou `https://github.com/...`

### 0.2. Pousse ton code depuis ton ordinateur

Ouvre un **terminal** dans le dossier `nafsolea` (clic droit dans le dossier → "Ouvrir dans le terminal" sous Windows 11).

Tape les commandes suivantes, une par une (remplace `TON_USER` par ton pseudo GitHub) :

```bash
git init
git add .
git commit -m "Initial commit — Nafsoléa v1.0"
git branch -M main
git remote add origin https://github.com/TON_USER/nafsolea.git
git push -u origin main
```

À la première commande `git push`, GitHub te demandera de te connecter. Suis les instructions à l'écran.

> Si tu n'as pas `git` installé, télécharge-le ici : https://git-scm.com/download/win

---

## Étape 1 — Base de données Neon (Postgres)

Neon donne une base Postgres gratuite, en Europe.

1. Va sur https://neon.tech
2. Clique **Sign up** et connecte-toi avec **GitHub**
3. Crée un projet :
   - Nom : `nafsolea`
   - Région : **Europe (Frankfurt)**
   - Postgres version : 16
4. Une fois créé, Neon affiche une **connection string** qui commence par `postgresql://...`
5. **Copie-la intégralement** et colle-la dans un bloc-notes — on l'utilisera à l'étape 3

---

## Étape 2 — Redis avec Upstash

Upstash donne un Redis gratuit (10 000 commandes/jour, suffisant pour la bêta).

1. Va sur https://upstash.com
2. **Sign up** avec GitHub
3. Dans le dashboard, clique **Create Database**
4. Paramètres :
   - Name : `nafsolea-redis`
   - Type : **Regional**
   - Region : **eu-west-1** (Irlande)
   - Enable TLS : **ON**
5. Une fois créé, va dans l'onglet **Details**. Note ces trois valeurs :
   - **Endpoint** (ex : `eu1-xxx.upstash.io`) → c'est ton `REDIS_HOST`
   - **Port** (ex : `6379`) → c'est ton `REDIS_PORT`
   - **Password** → c'est ton `REDIS_PASSWORD`

---

## Étape 3 — Backend sur Render

1. Va sur https://render.com
2. **Sign up** avec GitHub
3. Autorise Render à lire ton dépôt `nafsolea`
4. Dashboard Render → clique **New +** → **Blueprint**
5. Sélectionne le dépôt `nafsolea`
6. Render détecte automatiquement le fichier `render.yaml` → clique **Apply**
7. Le service `nafsolea-api` se crée. Clique dessus pour ouvrir ses réglages.
8. Va dans l'onglet **Environment**. Remplis les variables marquées avec la mention "sync: false" :

| Variable | Valeur à coller |
|---|---|
| `DATABASE_URL` | La connection string de Neon (étape 1) |
| `REDIS_HOST` | L'endpoint Upstash (étape 2) |
| `REDIS_PORT` | Le port Upstash (souvent `6379`) |
| `REDIS_PASSWORD` | Le mot de passe Upstash |
| `FRONTEND_URL` | `https://nafsolea.netlify.app` (on le remplacera à l'étape 4 si Netlify choisit un autre nom) |

9. Sauvegarde. Render redémarre le service.
10. Dans l'onglet **Events**, surveille le build. Il prend ~4 minutes la première fois (le Dockerfile installe les dépendances, lance `prisma db push` pour créer les tables, puis `seed.ts` pour créer le compte admin).
11. Quand tu vois **Live** 🟢 en haut, clique sur l'URL proposée (du type `https://nafsolea-api.onrender.com`). Ajoute `/api/v1/articles` à la fin — tu dois voir `[]` (liste vide d'articles).

> ⚠️ **L'URL que Render te donne** — copie-la précisément. Si elle est différente de `https://nafsolea-api.onrender.com`, on ajustera le frontend à l'étape suivante.

---

## Étape 4 — Frontend sur Netlify

1. Va sur https://app.netlify.com
2. **Sign up** avec GitHub
3. Dashboard → **Add new site** → **Import an existing project**
4. Choisis **Deploy with GitHub** → sélectionne `nafsolea`
5. Paramètres de build :
   - Branch : `main`
   - Build command : *(vide)*
   - Publish directory : `.` (un point)
6. Clique **Deploy site**
7. Après ~30 s, Netlify donne une URL du type `https://random-name-123.netlify.app`
8. (Optionnel) Clique **Domain settings** → **Change site name** → mets `nafsolea` pour avoir `https://nafsolea.netlify.app`

### 4.1. Si l'URL Render n'est pas celle attendue

Si à l'étape 3.11 Render t'a donné une URL différente de `https://nafsolea-api.onrender.com`, il faut la renseigner dans le frontend :

1. Ouvre le fichier `assets/js/api.js`
2. Trouve la ligne `const PROD_BACKEND_URL = 'https://nafsolea-api.onrender.com';`
3. Remplace par l'URL que Render t'a donnée
4. Sauvegarde
5. Dans le terminal, pousse la correction :
   ```bash
   git add assets/js/api.js
   git commit -m "fix: URL API de production"
   git push
   ```
6. Netlify redéploie automatiquement (~30 s)

### 4.2. Met à jour `FRONTEND_URL` côté Render

1. Retourne dans Render → service `nafsolea-api` → **Environment**
2. Change `FRONTEND_URL` pour l'URL Netlify exacte (ex : `https://nafsolea.netlify.app`)
3. Sauvegarde → Render redémarre (~1 min)

---

## Étape 5 — Test du site en ligne

Ouvre ton URL Netlify (ex : `https://nafsolea.netlify.app`).

- ✅ La page d'accueil doit s'afficher
- ✅ Clique sur **Blog** — tu dois voir la liste (vide) des articles
- ✅ Clique sur **Inscription** → crée un compte test
- ✅ Connecte-toi avec le compte admin généré automatiquement :
  - Email : `admin@nafsolea.com`
  - Mot de passe : `Admin1234!`
- ✅ Va sur `/admin/index.html` — tu dois voir le tableau de bord

> ⚠️ **Premier chargement lent** : le plan Render gratuit endort ton serveur après 15 min d'inactivité. Le tout premier appel après une pause met **30–60 secondes**. C'est normal. Pour supprimer cette latence → upgrade Render à $7/mois plus tard.

---

## Gestion du site (une fois en ligne)

### Changer le mot de passe admin

Connecte-toi à l'admin, va dans **Mon compte**, change le mot de passe. **Fais-le dès maintenant** — le mot de passe par défaut est public dans ce guide.

### Publier un article de blog

1. Connecte-toi en admin
2. `/admin/blog.html` → **Nouvel article**
3. Remplis titre, contenu, image de couverture
4. Statut : **Publié**
5. L'article apparaît immédiatement sur la page `/blog.html` publique

### Ajouter un psychologue

1. Le psychologue crée un compte sur `/inscription.html` en choisissant "Je suis psychologue"
2. Il complète son profil (spécialités, tarif, diplôme)
3. Toi, en admin, va sur `/admin/psychologues.html` → onglet **En attente**
4. Clique **Approuver** après vérification du diplôme

### Modifier le contenu des pages statiques (accueil, à propos, FAQ)

1. Ouvre le fichier HTML correspondant dans ton éditeur (ex : `index.html`, `a-propos.html`)
2. Modifie le texte
3. Sauvegarde, puis dans le terminal :
   ```bash
   git add .
   git commit -m "Mise à jour contenu"
   git push
   ```
4. Netlify redéploie automatiquement en ~30 s

---

## Phase 2 — Passage en production HDS (plus tard)

Quand tu seras prête pour des vrais patients, il faudra :

1. **Créer une société** (SASU recommandée pour une marketplace santé)
2. **Signer un contrat HDS** avec un hébergeur certifié :
   - OVHcloud Healthcare
   - Scaleway Healthcare
   - Clever Cloud HDS
3. **Valider Stripe Connect** avec KYB (documents société)
4. **Nommer un DPO** (Délégué à la Protection des Données)
5. **Rédiger** : mentions légales, CGU, politique de confidentialité (avocat recommandé)
6. **Déclarer** le traitement à la CNIL (formalité simplifiée pour la santé)
7. **Migrer** le code (identique) sur l'infra HDS : on change juste `DATABASE_URL`, `FRONTEND_URL` et on pointe le DNS

Compte ~2–3 mois pour boucler tout ça. Le code, lui, est déjà prêt.

---

## En cas de problème

- **Le backend ne démarre pas sur Render** → onglet **Logs** → cherche l'erreur. 9 fois sur 10 c'est une variable d'environnement manquante.
- **Le frontend s'affiche mais les boutons ne marchent pas** → ouvre la console du navigateur (F12 → onglet Console) → tu verras si l'URL du backend est bien reconnue.
- **Erreur CORS** → vérifie que `FRONTEND_URL` dans Render correspond **exactement** (avec `https://`, sans slash final) à l'URL Netlify.
- **Rien ne se passe après `git push`** → va sur Netlify/Render, onglet **Deploys** : tu verras si le build est en cours ou en échec.

Pour toute erreur qui bloque, copie le message dans ta prochaine question et on résoudra ensemble.
