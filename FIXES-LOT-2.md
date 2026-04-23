# 🔧 LOT 2 — fix des bugs après déploiement

Date : 23 avril 2026

Sarah, voici tout ce qui a été corrigé après ton dernier test. **La cause racine de la majorité des bugs n'était pas du tout là où on cherchait** : c'était une seule ligne dans le système d'authentification qui cassait à peu près TOUS les endpoints connectés (création d'article, newsletter, /users/me, approbation psy, …).

---

## 🎯 Bug racine — JWT cassé pour TOUTE la partie connectée

### Symptômes que tu as vus
- 500 sur `GET /users/me` quand tu allais sur "Prendre rendez-vous"
- 500 `Argument 'createdById' is missing` à la création de newsletter
- 500 `Argument 'author' is missing` à la création d'article
- 500 sur l'approbation d'un psy (en plus du problème SendGrid)

### Cause
Quand tu te connectes, le backend signe un token JWT avec `sub: ton_id`. Toutes les routes protégées (création d'article, newsletter, approbation psy…) lisent ensuite `user.sub` pour savoir qui tu es. Mais la stratégie JWT (le morceau qui décode le token et te rattache à la requête) renvoyait un objet sans le champ `sub` → `user.sub` était `undefined` → Prisma plantait avec « Argument X is missing ».

### Fix
`backend/src/modules/auth/strategies/jwt.strategy.ts` : on renvoie maintenant `{ sub, id, email, role, isActive }`. Une seule ligne, mais elle débloque énormément de choses.

---

## 🎯 Bug — l'approbation psy plantait silencieusement (= les psys restaient en PENDING)

### Symptôme
Tu cliquais sur "Valider" un psy dans l'admin → message d'erreur 500 → tu rechargeais → le psy semblait disparaître de la liste "à valider", **mais il n'apparaissait pas non plus dans la liste publique**.

### Cause
1. L'endpoint `approve` envoyait un email de confirmation au psy via SendGrid.
2. SendGrid n'est pas configuré (clé placeholder dans `render.yaml`) → 535 Authentication failed.
3. L'erreur d'envoi remontait jusqu'au contrôleur → **toute la transaction d'approbation était annulée** → le psy restait en PENDING en base.

### Fix
`backend/src/modules/notifications/notifications.service.ts` :
- On détecte les clés "placeholder" (`SG.placeholder_replace_after_signup`) et on bascule en mode **DRY RUN** : les emails sont juste loggés, pas envoyés.
- En plus, si jamais l'envoi rate quand même, on **n'aboutit plus l'erreur** : un envoi raté ne doit JAMAIS faire planter une opération métier (approbation psy, confirmation rdv, etc.).

Même protection sur le service newsletter (`backend/src/modules/newsletter/newsletter.service.ts`) — il l'avait déjà partiellement, on a homogénéisé.

### ⚠️ Action manuelle après déploiement
Tous les psys que tu as "approuvés" auparavant et qui ne s'affichent pas dans `psychologues.html` côté public sont **probablement encore en statut PENDING** à cause de l'erreur silencieuse. Il faut **re-cliquer "Valider"** sur chacun depuis `admin/psychologues.html` une fois le nouveau backend déployé.

---

## 🎯 Bug — articles publiés invisibles dans leur rubrique

### Cause
Les libellés de catégorie dans `blog.html` (boutons de filtre) ne correspondaient PAS du tout à ceux de `admin/article.html` (liste déroulante). Exemple : tu sélectionnes « Anxiété & Stress » à l'écriture mais le bouton de filtre attendait « Anxiété & dépression » → 0 résultat.

### Fix
`blog.html` : les 8 catégories sont maintenant **strictement identiques** au `<select>` de l'éditeur :
- Anxiété & Stress
- Expatriation
- Relations
- Dépression
- Trauma
- Identité culturelle
- Bien-être
- Conseils pratiques

---

## 🎯 Bug — admin : email non vérifié pas visible

### Fix
- `admin/utilisateurs.html` et `admin/psychologues.html` affichent maintenant un badge orange « ⏳ Email non validé » à côté de l'email.
- Bouton ✉️ pour valider manuellement l'email d'un compte (utile pour les psys qui se connectent au support en disant « je reçois pas l'email »).
- Backend `admin.service.ts` renvoie maintenant `emailVerifiedAt` dans la liste users.

---

## 🎯 Bug — debug : on ne voyait pas les vraies erreurs 500

### Fix
`backend/src/common/filters/http-exception.filter.ts` : pour les erreurs 500, la vraie erreur est maintenant exposée dans le champ `debug` de la réponse JSON. Très utile pour diagnostiquer (et sans risque : ce n'est jamais affiché côté UI).

---

## 📦 À faire pour déployer ce lot

```bash
cd C:\Users\Thinkpad\Desktop\nafsolea
git add .
git commit -m "Fix lot 2: JWT sub, SendGrid placeholder, blog categories, admin email status"
git push
```

Render va automatiquement re-builder le backend (~3-5 min). Netlify rebuilde le frontend dans la foulée.

## ✅ Plan de test après déploiement

1. **Test JWT** : connecte-toi à `admin.html`, va sur "Mon profil" / "Prendre RDV" — plus d'erreur 500.
2. **Test newsletter** : crée un brouillon, ajoute un texte, "Enregistrer" → succès. Puis "Envoyer" → succès (les emails sont juste loggés côté Render, pas vraiment envoyés tant que SendGrid n'est pas branché).
3. **Test article** : crée un article via `admin/article.html`, choisis une catégorie de la liste, publie.
4. **Test catégorie** : va sur `blog.html`, clique sur la catégorie de ton article — il doit apparaître.
5. **Test approbation psy** : va sur `admin/psychologues.html`, **re-clique "Valider" sur tous les psys qui ne s'affichaient pas** côté public. Plus d'erreur. Vérifie ensuite sur `psychologues.html` (page publique) qu'ils apparaissent.
6. **Test article display** : si après tout ça, en cliquant un article dans `blog.html` la page `lire.html` n'affiche toujours rien, ouvre la console (F12 → onglet Console) et envoie-moi le message d'erreur exact.

---

## ⚠️ Pour activer SendGrid (plus tard, quand tu seras prête)

Tant que la clé SendGrid sur Render est `SG.placeholder_replace_after_signup`, **aucun email n'est envoyé** (mode DRY RUN). Pour activer pour de vrai :
1. Crée un compte SendGrid (gratuit jusqu'à 100 emails/jour).
2. Génère une clé API "Full Access".
3. Sur Render → Environment → remplace `SENDGRID_API_KEY` par ta vraie clé `SG.xxxx`.
4. Redéploie. Les logs Render afficheront `SendGrid configuré — emails transactionnels actifs.`
