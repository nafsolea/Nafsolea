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
RUN npm install --omit=dev --legacy-peer-deps && npm cache clean --force
# Install prisma CLI for runtime schema sync (small, one-shot at boot)
RUN npm install --no-save prisma@5.10.0 ts-node@10.9.2 typescript@5.3.3 --legacy-peer-deps

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY prisma ./prisma
COPY tsconfig.json ./

# Non-root user for security
RUN addgroup -g 1001 -S nodejs && adduser -S nestjs -u 1001 && chown -R nestjs:nodejs /app
USER nestjs

EXPOSE 3000

# Synchronise le schéma avec la base, crée les comptes de test (admin/patient/psy),
# puis lance l'app. Le seed utilise `upsert` : safe de le lancer à chaque boot.
CMD ["sh", "-c", "npx prisma db push --skip-generate --accept-data-loss && (npx ts-node prisma/seed.ts || echo 'seed skipped') && node dist/main"]
