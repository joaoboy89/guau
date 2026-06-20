# ── Stage 1: Build ──────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# openssl requerido por Prisma en Alpine (musl)
RUN apk add --no-cache openssl

# Limitar memoria durante el build (VPS con RAM limitada)
ENV NODE_OPTIONS=--max-old-space-size=512

# Instalar dependencias (aprovechar cache de Docker)
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
RUN npm ci --legacy-peer-deps

# Copiar código fuente
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api

# Generar Prisma Client y compilar NestJS
RUN cd apps/api && npx prisma generate
RUN cd apps/api && npm run build

# ── Stage 2: Runtime ─────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

# openssl requerido por Prisma en runtime
RUN apk add --no-cache openssl

ENV NODE_ENV=production
ENV NODE_OPTIONS=--max-old-space-size=256

# Solo dependencias de producción
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
RUN npm ci --omit=dev --legacy-peer-deps && npm cache clean --force

# Código compartido (resuelve el symlink node_modules/@guau/shared)
COPY packages/shared ./packages/shared

# Schema de Prisma (necesario para migrate deploy)
COPY apps/api/prisma ./apps/api/prisma

# Output compilado
COPY --from=builder /app/apps/api/dist ./apps/api/dist

# Prisma Client generado (evita regenerar en runtime)
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

EXPOSE 3001

# Migrar DB y arrancar
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy --schema=apps/api/prisma/schema.prisma && node apps/api/dist/main.js"]
