FROM node:20-alpine
WORKDIR /app

# Copiar manifests de workspaces primero (para aprovechar cache de Docker)
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/

# Instalar dependencias respetando workspaces
RUN npm ci --legacy-peer-deps

# Copiar código fuente
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api

# Generar Prisma Client (no necesita DB en este paso)
RUN cd apps/api && npx prisma generate

# Compilar NestJS
RUN cd apps/api && npm run build

EXPOSE 3001

# Al arrancar: migrar DB y luego iniciar el servidor
CMD ["sh", "-c", "npx prisma migrate deploy --schema=apps/api/prisma/schema.prisma && node apps/api/dist/main.js"]
