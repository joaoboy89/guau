FROM node:20-alpine
WORKDIR /app

RUN apk add --no-cache openssl

# Limitar memoria durante el build
ENV NODE_OPTIONS=--max-old-space-size=512

# Instalar dependencias
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
RUN npm ci --legacy-peer-deps

# Copiar código fuente
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api

# Generar Prisma Client y compilar NestJS
RUN cd apps/api && npx prisma generate
RUN cd apps/api && npm run build || (echo 'BUILD FAILED' && exit 1)
RUN ls -la apps/api/ && ls -la apps/api/dist/ 2>/dev/null || echo 'NO DIST FOLDER'
RUN cat apps/api/package.json | grep -A5 scripts
RUN find /app -name 'main.js' 2>/dev/null || echo 'main.js no encontrado en ningun lado'

# Eliminar devDependencies para reducir imagen final
RUN npm prune --omit=dev --legacy-peer-deps && npm cache clean --force

ENV NODE_ENV=production
ENV NODE_OPTIONS=--max-old-space-size=256

EXPOSE 3001

CMD ["sh", "-c", "node_modules/.bin/prisma db push --schema=apps/api/prisma/schema.prisma --skip-generate && node apps/api/dist/main.js"]
