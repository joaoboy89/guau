FROM node:20-alpine
WORKDIR /app

RUN apk add --no-cache openssl

ENV NODE_OPTIONS=--max-old-space-size=512
ENV PRISMA_SKIP_POSTINSTALL_GENERATE=true

COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
RUN npm ci --legacy-peer-deps

COPY packages/shared ./packages/shared
COPY apps/api ./apps/api

RUN cd apps/api && npx prisma generate
RUN cd apps/api && npm run build || (echo 'BUILD FAILED' && exit 1)
RUN ls -la apps/api/dist/main.js

RUN npm prune --omit=dev --legacy-peer-deps && npm cache clean --force

ENV NODE_ENV=production
ENV NODE_OPTIONS=--max-old-space-size=256

EXPOSE 3001

CMD ["sh", "-c", "node_modules/.bin/prisma db push --schema=apps/api/prisma/schema.prisma --skip-generate && node apps/api/dist/main.js"]
