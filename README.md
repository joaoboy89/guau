# Güau

Marketplace de paseo de perros para Capital Federal y Gran Buenos Aires, Argentina. Conecta dueños de mascotas con paseadores verificados — reserva, pago y (en construcción) seguimiento GPS en tiempo real.

**Estado del proyecto:** pre-MVP, en beta cerrada de desarrollo. `master` es producción — no hay ambiente de staging.

---

## Stack

| Capa | Tecnología |
|------|-----------|
| Frontend | Next.js 14 (App Router) |
| Backend | NestJS |
| Base de datos | PostgreSQL + Prisma |
| Real-time | Socket.io |
| Pagos | MercadoPago (Checkout Pro) |
| Email | Resend |
| Auth | JWT + Refresh Tokens |
| Deploy | VPS propio + Docker Compose + Cloudflare Tunnel |
| CI/CD | GitHub Actions (push a `master` → build → deploy automático) |
| Monorepo | npm workspaces + Turborepo |

## Estado actual

Implementado y funcionando: registro y auth completos, perfil de dueño y paseador, búsqueda de paseadores por cercanía, flujo de reserva (crear → confirmar/rechazar) y pago del paseo vía MercadoPago (Fase 1, sin split automático — validado end-to-end en sandbox).

Pendiente: integración de mapas (Mapbox ya está instalado, falta conectarlo), split automático de pago al paseador (Fase 2 de MercadoPago Marketplace), upload de fotos (Cloudflare R2), pantallas de paseo en curso para el paseador, notificaciones push de navegador.

## Estructura del monorepo

```
guau/
├── apps/
│   ├── web/       # Next.js — frontend
│   └── api/       # NestJS — backend
├── packages/
│   └── shared/    # Tipos TypeScript compartidos entre web y api
├── infra/vps/     # docker-compose.yml de producción + script de deploy manual
├── docs/          # Blueprint técnico + pendientes + brand guide
└── .github/workflows/  # CI/CD
```

## Correr el proyecto en local

Requisitos: Node 20+, npm 10+, Docker (para la base de datos local).

```bash
# 1. Clonar e instalar dependencias (workspaces — un solo install para todo)
npm install

# 2. Levantar Postgres local (puerto 5433, no pisa un Postgres del sistema)
docker compose -f docker-compose.dev.yml up -d

# 3. Configurar variables de entorno
# apps/web/ tiene .env.example — copiarlo y completar.
# apps/api/ todavía NO tiene .env.example (pendiente crearlo) — armar apps/api/.env
# a mano con las claves listadas en la sección "Variables de entorno" más abajo.
# DATABASE_URL local: postgresql://guau:devpassword@localhost:5433/guau?schema=public
#   (el contenedor publica 5432 interno en el puerto 5433 del host — usá 5433, no 5432,
#   desde una app corriendo fuera de Docker. El comentario dentro de docker-compose.dev.yml
#   dice 5432 por error; es un detalle a corregir, ver docs/guau-pendientes.md)

# 4. Migrar y sembrar datos
cd apps/api
npm run prisma:migrate
npm run prisma:seed

# 5. Levantar todo (desde la raíz del repo)
npm run dev   # corre web (puerto 3000) y api (puerto 3001) en paralelo, vía Turborepo
```

Backend disponible en `http://localhost:3001`, con Swagger en `http://localhost:3001/docs` (sin Basic Auth en desarrollo — la protección solo aplica cuando `NODE_ENV=production`). Frontend en `http://localhost:3000`.

## Variables de entorno

Nombres reales en uso (los valores no se documentan acá — pedir por canal privado):

```
DATABASE_URL
JWT_SECRET, JWT_EXPIRES_IN, JWT_REFRESH_SECRET, JWT_REFRESH_EXPIRES_IN, JWT_EMAIL_SECRET
MP_ACCESS_TOKEN, MP_CLIENT_ID, MP_CLIENT_SECRET, MP_MARKETPLACE_FEE, MP_WEBHOOK_SECRET
SWAGGER_USER, SWAGGER_PASSWORD          # solo se usan si NODE_ENV=production
NEXT_PUBLIC_MAPBOX_TOKEN
RESEND_API_KEY, EMAIL_FROM
API_URL, FRONTEND_URL, NEXT_PUBLIC_API_URL, NEXT_PUBLIC_WS_URL
```

## Deploy y CI/CD

Cada `push` a `master` dispara `.github/workflows/docker.yml`: construye las imágenes de `api` y `web`, las publica en GitHub Container Registry, y se conecta por SSH al VPS de producción para bajarlas y levantar los contenedores con Docker Compose. Sin ambiente de staging — lo que se pushea a `master` queda en producción en 2-3 minutos.

Importante: el pipeline de CI/CD **no ejecuta migraciones de Prisma automáticamente**. Si un cambio incluye una migración nueva, hay que correrla a mano en el VPS (o vía `infra/vps/deploy.sh`, que sí las corre) antes o después del deploy, según el caso.

La conexión al VPS público es únicamente a través de un túnel de Cloudflare — no hay puertos abiertos directos por diseño (aunque la exposición directa del puerto de Docker sigue sin verificarse).

## Documentación adicional

Existe una carpeta `docs/` con notas de arquitectura, modelo de datos y decisiones de producto — **es local, privada, y no forma parte de este repositorio** (`docs/` está en `.gitignore` a propósito). Si estás leyendo esto desde un clon del repo, esa carpeta no va a estar presente; este README es la referencia autosuficiente para levantar y entender el proyecto.

---

Proyecto privado. No licenciado para uso externo.
