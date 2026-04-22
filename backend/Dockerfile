# ── Stage 1: Build ──────────────────────────────────────────────
# On utilise node:20-slim (Debian) — meilleur support OpenSSL pour Prisma.
FROM node:20-slim AS builder
WORKDIR /app

# OpenSSL + outils de build requis par Prisma pour générer son client.
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
# `npm install` (et non `npm ci`) car le repo n'a pas de package-lock.json.
RUN npm install --legacy-peer-deps

COPY . .
# On utilise le binaire LOCAL (pas npx) pour éviter qu'npx aille re-télécharger
# une autre version de prisma qui pourrait être incompatible.
# `--schema` explicite : évite l'erreur "path undefined" sur certaines configs.
RUN ./node_modules/.bin/prisma generate --schema=./prisma/schema.prisma
RUN npm run build

# ── Stage 2: Production image ────────────────────────────────────
FROM node:20-slim AS production
WORKDIR /app

ENV NODE_ENV=production

# OpenSSL requis aussi au runtime pour Prisma Client.
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
# `prisma` et `ts-node` sont dans `dependencies` → inclus ici.
RUN npm install --omit=dev --legacy-peer-deps && npm cache clean --force
RUN npm install --no-save typescript@5.3.3 --legacy-peer-deps

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY prisma ./prisma
COPY tsconfig.json ./

# Utilisateur non-root pour la sécurité.
RUN groupadd -g 1001 nodejs && useradd -r -u 1001 -g nodejs nestjs && chown -R nestjs:nodejs /app
USER nestjs

EXPOSE 3000

# Synchronise le schéma + seed + lance l'app. Binaires LOCAUX (pas npx)
# pour éviter que npx aille re-télécharger une autre version de prisma.
CMD ["sh", "-c", "./node_modules/.bin/prisma db push --skip-generate --accept-data-loss && (./node_modules/.bin/ts-node --transpile-only prisma/seed.ts || echo 'seed skipped') && node dist/main"]
