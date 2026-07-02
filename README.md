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
| Auth | JWT + Refresh Tokens, en cookies `httpOnly` (no accesibles desde JS) |
| Testing | Jest (backend: 132 tests en los módulos de mayor riesgo — pagos, auth, búsqueda, reservas, admin; frontend: en progreso) |
| Deploy | VPS propio + Docker Compose + Cloudflare Tunnel |
| CI/CD | GitHub Actions (push a `master` → build → deploy automático) |
| Monorepo | npm workspaces + Turborepo |

## Estado actual

Implementado y funcionando: registro y auth completos (cookies httpOnly, sin tokens accesibles desde JavaScript), perfil de dueño y paseador (incluida carga de zona de trabajo por geolocalización), búsqueda de paseadores por cercanía, flujo completo de reserva (crear → confirmar/rechazar → en curso → completado), y 132 tests automatizados de backend cubriendo los módulos de mayor riesgo (pagos, auth, búsqueda, reservas, administración).

Pago vía MercadoPago: Fase 1 (checkout simple) validada end-to-end en sandbox. Fase 2 (split real de marketplace vía OAuth Connect del paseador + `marketplace_fee`) tiene el código implementado y deployado, pendiente de una prueba end-to-end completa con un pago real de sandbox.

Pendiente: integración de mapas (Mapbox ya está instalado, falta conectarlo), upload de fotos (Cloudflare R2), tracking GPS en vivo del lado del dueño, notificaciones push de navegador, ampliar cobertura de tests de frontend.

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

## Tests

```bash
# Backend — 132 tests (Jest)
cd apps/api && npm test

# Frontend — Jest vía next/jest
cd apps/web && npm test
```

Cobertura enfocada en los módulos de mayor riesgo (pagos, autenticación, búsqueda de paseadores, ciclo de vida de una reserva, panel de administración) en vez de perseguir 100% de líneas — CRUD simple sin lógica de negocio queda sin cubrir a propósito.

## Variables de entorno

Nombres reales en uso (los valores no se documentan acá — pedir por canal privado):

```
DATABASE_URL
JWT_SECRET, JWT_EXPIRES_IN, JWT_REFRESH_SECRET, JWT_REFRESH_EXPIRES_IN, JWT_EMAIL_SECRET
MP_ACCESS_TOKEN, MP_CLIENT_ID, MP_CLIENT_SECRET, MP_MARKETPLACE_FEE, MP_WEBHOOK_SECRET
SWAGGER_USER, SWAGGER_PASSWORD          # solo se usan si NODE_ENV=production
COOKIE_DOMAIN                            # dominio compartido para las cookies httpOnly (ej: .midominio.com)
NEXT_PUBLIC_MAPBOX_TOKEN
RESEND_API_KEY, EMAIL_FROM
API_URL, FRONTEND_URL, NEXT_PUBLIC_API_URL, NEXT_PUBLIC_WS_URL
```

## Deploy y CI/CD

Cada `push` a `master` dispara `.github/workflows/docker.yml`: construye las imágenes de `api` y `web`, las publica en GitHub Container Registry, y se conecta por SSH al VPS de producción para bajarlas y levantar los contenedores con Docker Compose. Sin ambiente de staging — lo que se pushea a `master` queda en producción en 2-3 minutos.

Importante: el pipeline de CI/CD **no ejecuta migraciones de Prisma automáticamente**, y tampoco corre la suite de tests antes de deployar — un test roto no frena el deploy hoy (mejora pendiente). Si un cambio incluye una migración nueva, hay que correrla a mano en el VPS (o vía `infra/vps/deploy.sh`, que sí las corre) antes o después del deploy, según el caso.

La conexión al VPS público es únicamente a través de un túnel de Cloudflare. Los puertos de los contenedores están atados a `127.0.0.1` (no accesibles desde la IP pública), y el firewall del proveedor solo permite entrada por SSH — verificado con pruebas reales de conexión externa, no asumido. Acceso SSH solo por clave (autenticación por contraseña deshabilitada), con `fail2ban` activo.

## Documentación adicional

Existe una carpeta `docs/` con notas de arquitectura, modelo de datos y decisiones de producto — **es local, privada, y no forma parte de este repositorio** (`docs/` está en `.gitignore` a propósito). Si estás leyendo esto desde un clon del repo, esa carpeta no va a estar presente; este README es la referencia autosuficiente para levantar y entender el proyecto.

---

Proyecto privado — ver [`LICENSE`](./LICENSE). Código visible con fines de portfolio y evaluación técnica; no licenciado para uso comercial o redistribución.
