# ── Stage 1: Build ──────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
# `npm install` (et non `npm ci`) car le repo n'a pas de package-lock.json.
# npm va le générer et résoudre les versions au build.
RUN npm install --legacy-peer-deps

COPY . .
RUN npx prisma generate
RUN npm run build

# ── Stage 2: Production image ────────────────────────────────────
FROM node:20-alpine AS production
WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
# `prisma` et `ts-node` sont maintenant dans `dependencies` → inclus ici.
RUN npm install --omit=dev --legacy-peer-deps && npm cache clean --force
# TypeScript reste utile uniquement au runtime pour ts-node (exécution seed.ts).
RUN npm install --no-save typescript@5.3.3 --legacy-peer-deps

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY prisma ./prisma
COPY tsconfig.json ./

# Non-root user for security
RUN addgroup -g 1001 -S nodejs && adduser -S nestjs -u 1001 && chown -R nestjs:nodejs /app
USER nestjs

EXPOSE 3000

# Synchronise le schéma avec la base, crée les comptes de test (admin/patient/psy),
# puis lance l'app. On utilise les binaires LOCAUX (pas npx) pour éviter
# que npx aille télécharger une autre version au démarrage.
CMD ["sh", "-c", "./node_modules/.bin/prisma db push --skip-generate --accept-data-loss && (./node_modules/.bin/ts-node prisma/seed.ts || echo 'seed skipped') && node dist/main"]
