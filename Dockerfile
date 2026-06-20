# ── Stage 1: Build ──────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

RUN apk add --no-cache openssl

# Limitar memoria durante el build
ENV NODE_OPTIONS=--max-old-space-size=512

COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
RUN npm ci --legacy-peer-deps

COPY packages/shared ./packages/shared
COPY apps/api ./apps/api

RUN cd apps/api && npx prisma generate

RUN cat apps/api/tsconfig.json && cat apps/api/tsconfig.build.json 2>/dev/null || echo 'no tsconfig.build.json'

RUN cd apps/api && npm run build || (echo 'BUILD FAILED' && exit 1)

RUN ls -la apps/api/dist/ 2>&1 || echo 'dist vacio'

# ── Stage 2: Runtime ─────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

RUN apk add --no-cache openssl

ENV NODE_ENV=production
ENV NODE_OPTIONS=--max-old-space-size=256

COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
RUN npm ci --omit=dev --legacy-peer-deps && npm cache clean --force

COPY packages/shared ./packages/shared
COPY apps/api/prisma ./apps/api/prisma

COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

EXPOSE 3001

# prisma db push sincroniza el schema con la DB sin necesitar archivos de migración.
# Correcto para un deploy inicial. Una vez que el equipo tenga DB local, se puede
# generar las migraciones con "prisma migrate dev --name init" y cambiar a migrate deploy.
CMD ["sh", "-c", "node_modules/.bin/prisma db push --schema=apps/api/prisma/schema.prisma --skip-generate && node apps/api/dist/main.js"]
