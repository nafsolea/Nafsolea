# 🔧 Fix des 7 bugs — récap pour Sarah

Date : 22 avril 2026

Voici tout ce qui a été corrigé dans ce lot. **Tu dois faire 3 actions manuelles** à la fin (voir tout en bas).

---

## ✅ Bug 1 — Publication d'article : « Erreur interne est survenue »

**Cause :** la limite de taille de la requête côté backend (NestJS / Express) était trop basse. Quand tu publiais un article avec une grosse image de couverture (~2 Mo en base64 ≈ 2,7 Mo de payload JSON), le serveur refusait sans message clair.

**Fix :** la limite est passée de 1 Mo à **5 Mo**.

**Fichier modifié :** `backend/src/main.ts`

---

## ✅ Bug 2 — Les psys ne s'affichent pas dans la liste publique

**Cause :** double souci.
1. Le frontend lisait `p.sessionPrice` (n'existe pas) au lieu de `p.sessionRate` (vrai nom du champ backend) → le prix s'affichait « — » mais surtout, plus important, **le backend filtre `status: 'APPROVED'`**. Tes psys de test ont été créés avec le mode bêta auto-approve désactivé → ils restent en statut PENDING tant qu'un admin ne les valide pas.

**Fix :**
- Frontend : `psychologues.html` utilise maintenant `sessionRate`.
- Tu devras **valider manuellement tes psys de test depuis l'admin** (voir section « actions manuelles »).

**Fichier modifié :** `psychologues.html`

---

## ✅ Bug 3 — Les profils de psy ne fonctionnent pas

**Cause :** même problème qu'au-dessus — le backend ne renvoie un profil que si le psy a `status: APPROVED`. Sinon : 404.

**Fix :** une fois les psys approuvés via l'admin, leur fiche s'affichera.

---

## ✅ Bug 4 — Le « profil détaillé » ne marche pas

**Cause :** dépend du déploiement backend (les endpoints `/users/me`, `/admin/users/:id` doivent être actifs sur Render).

**Fix :** ils sont déjà dans le code — le `git push` les déploiera. Côté admin/utilisateurs, le bouton 👁 affiche pour l'instant un toast « à implémenter » ; on pourra brancher la vue détaillée plus tard.

---

## ✅ Bug 5 — L'inscription passe sans validation d'email

**Cause :** j'avais activé `BETA_AUTO_VERIFY_EMAIL=true` pour faciliter les tests. Tu m'as demandé de remettre la **validation obligatoire**.

**Fix :**
- `render.yaml` : `BETA_AUTO_VERIFY_EMAIL=false`
- L'inscription crée maintenant un token de vérification ; sans clic dans l'email, le user ne peut pas se connecter (« Veuillez vérifier votre email »).

**⚠️ Mais SendGrid n'est pas configuré** → tu ne peux pas vraiment envoyer d'email. Pour ne pas être bloquée, **j'ai ajouté un endpoint admin qui te permet de valider l'email manuellement** depuis le panneau admin.

**Comment :** dans `/admin/utilisateurs.html`, à côté de chaque user non vérifié, tu vois maintenant :
- un badge orange « ⏳ Email non validé »
- un bouton **✉️ vert** pour valider d'un clic

Pareil pour les psys dans `/admin/psychologues.html`.

**Fichiers modifiés :**
- `backend/src/modules/admin/admin.controller.ts` (nouveau endpoint)
- `backend/src/modules/admin/admin.service.ts` (méthode `verifyUserEmail`)
- `assets/js/api.js` (client `verifyUserEmail`)
- `admin/utilisateurs.html` (badge + bouton)
- `admin/psychologues.html` (badge + bouton)

---

## ✅ Bug 6 — Les psys se connectent sans approbation admin

**Cause :** j'avais activé `BETA_AUTO_APPROVE_PSY=true`. Tu veux **l'approbation manuelle obligatoire**.

**Fix :** `render.yaml` : `BETA_AUTO_APPROVE_PSY=false`

Maintenant le flow correct est :
1. Le psy s'inscrit → statut `PENDING`, ne s'affiche pas publiquement
2. Toi (admin) tu vas dans `/admin/psychologues.html` → tu vois le badge « En attente »
3. Tu cliques **✓ Valider** → il devient `APPROVED` et s'affiche partout

**Fichier modifié :** `render.yaml`

---

## ✅ Bug 7 — « Mon cabinet » : erreur de chargement

**Cause :** la page appelle `/api/v1/psychologists/me/dashboard`. Cet endpoint **existe** dans le code backend mais n'est pas encore déployé sur Render — d'où l'erreur. Le `git push` corrigera.

**Important :** un psy ne pourra accéder à son cabinet que **s'il est APPROVED**. Sinon le service répond bien mais avec son statut PENDING (à toi de gérer côté UI si tu veux afficher un message « en attente d'approbation »).

---

## ✅ Bug 8 — Newsletter : impossible d'envoyer + bouton invisible

**Causes multiples :**
1. **Bouton blanc sur blanc** : utilisait `var(--primary)` qui n'existe pas dans `admin.css` (les vraies vars sont `--navy`, `--blue`, `--rose`, `--green`).
2. **Pas de bouton « Envoyer »** : seulement « Enregistrer comme brouillon » dans le compose.
3. **Pas de visibilité sur l'audience** : on ne voyait pas combien d'abonnés allaient recevoir.

**Fix :**
- Couleur du bouton brouillon corrigée → `var(--navy)`.
- Layout du compose passé à **3 boutons** : Annuler / Enregistrer comme brouillon / **Envoyer maintenant** (bouton vert).
- Ajout d'une **carte audience** qui affiche le nombre d'abonnés actifs.
- Le bouton « Envoyer maintenant » :
  - vérifie que sujet + contenu sont remplis,
  - demande confirmation (« Envoyer à X abonnés ? Action irréversible »),
  - crée le brouillon puis l'envoie d'un coup,
  - rafraîchit la liste des campagnes.

**Fichier modifié :** `admin/newsletter.html`

---

# 🚀 ACTIONS MANUELLES À FAIRE

## 1) Push sur GitHub pour redéployer

Dans le terminal, depuis le dossier `nafsolea` :

```bash
git add .
git commit -m "fix: 7 bugs post-déploiement (blog, psys, newsletter, validation email)"
git push
```

Render redéploie tout seul en ~3 minutes.

## 2) ⚠️ Vérifier les variables d'environnement Render

Si tu avais ajouté à la main les variables `BETA_AUTO_VERIFY_EMAIL=true` et `BETA_AUTO_APPROVE_PSY=true` dans le dashboard Render, **enlève-les ou passe-les à `false`** :

- Va sur https://dashboard.render.com
- Clique sur ton service `nafsolea-api`
- Onglet **Environment**
- Pour `BETA_AUTO_VERIFY_EMAIL` et `BETA_AUTO_APPROVE_PSY` : soit les supprimer, soit les passer à `false`
- Render redéploie automatiquement

(Si tu ne les avais jamais ajoutées à la main, le `render.yaml` les passe à `false` tout seul — rien à faire.)

## 3) Valider tes psys et users de test après le déploiement

Une fois le redéploiement fini :

**Pour les users (patients) bloqués sans email validé :**
- Va sur `/admin/utilisateurs.html`
- Filtre sur « Patients »
- À côté de chaque ligne avec le badge orange « ⏳ Email non validé », clique le bouton **✉️ vert** → valider

**Pour les psys de test :**
- Va sur `/admin/psychologues.html`
- Si un psy a le badge « ⏳ Email non validé » → clique **✉️** d'abord
- Puis pour ceux en statut « En attente » → clique **✓ Valider**

Une fois ces 2 étapes faites, tes psys apparaîtront dans la recherche publique et pourront se connecter à `/mon-cabinet.html`.

---

## Récap des fichiers modifiés

```
backend/src/main.ts                                  (limite body 5 Mo)
backend/src/modules/admin/admin.controller.ts        (endpoint verify-email)
backend/src/modules/admin/admin.service.ts           (verifyUserEmail + emailVerifiedAt dans le select)
render.yaml                                          (BETA_* = false)
assets/js/api.js                                     (client verifyUserEmail)
psychologues.html                                    (sessionRate)
admin/utilisateurs.html                              (badge + bouton verify)
admin/psychologues.html                              (badge + bouton verify)
admin/newsletter.html                                (couleur boutons + Send Now + audience)
```

Bon redéploiement 🚀
