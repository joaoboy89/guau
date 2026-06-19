# GÜAU — Blueprint Técnico Completo
> Documento de referencia para desarrollo. Versión 1.0 — Junio 2026.
> Usar como contexto base al iniciar Claude Code.

---

## 1. RESUMEN DEL PRODUCTO

**Güau** es un marketplace que conecta paseadores de perros con dueños de mascotas en Capital Federal y Gran Buenos Aires, Argentina. El diferencial central es la **confianza**: verificación de identidad de paseadores, GPS en tiempo real, seguro incluido y sistema de reputación.

- **Público objetivo inicial:** CABA → GBA
- **Escalabilidad:** Arquitectura preparada para agregar servicios (guardería, peluquería, veterinaria) y expandirse geográficamente.
- **Modelo de negocio:** Comisión variable 10–20% sobre cada paseo completado (split automático vía MercadoPago Marketplace).

---

## 2. STACK TECNOLÓGICO

| Capa | Tecnología | Versión | Justificación |
|------|-----------|---------|---------------|
| Frontend | Next.js (PWA) | 14+ | React SSR, funciona como app en mobile, SEO |
| Backend | NestJS | 10+ | Modular, TypeScript, escala bien |
| Base de datos | PostgreSQL + PostGIS | 15+ | Queries geoespaciales para zonas y tracking |
| ORM | Prisma | Latest | Type-safe, migraciones simples |
| Real-time | Socket.io | Latest | GPS tracking en vivo, notificaciones |
| Mapas | Mapbox GL JS | Latest | 50% más barato que Google Maps |
| Auth | JWT + Refresh Tokens | — | Sin dependencias externas |
| Storage | Cloudflare R2 | — | Fotos DNI, perros, avatares. 10x más barato que S3 |
| Pagos | MercadoPago Marketplace API | — | Split automático, estándar Argentina |
| Email | Resend | — | Transaccional (confirmaciones, alertas) |
| Deploy Backend | Railway | — | PostgreSQL incluido, simple |
| Deploy Frontend | Vercel | — | Optimizado para Next.js |
| Monorepo | Turborepo | Latest | Un solo repo, builds incrementales |

---

## 3. ESTRUCTURA DEL MONOREPO

```
guau/
├── apps/
│   ├── web/                    # Next.js 14 — Frontend PWA
│   │   ├── app/                # App Router
│   │   │   ├── (auth)/         # Login, registro
│   │   │   ├── (owner)/        # Dashboard dueño
│   │   │   ├── (walker)/       # Dashboard paseador
│   │   │   ├── (admin)/        # Panel administración
│   │   │   └── api/            # Next.js API routes (solo proxies ligeros)
│   │   ├── components/
│   │   │   ├── ui/             # Componentes base (shadcn/ui)
│   │   │   ├── maps/           # Mapbox components
│   │   │   ├── walks/          # Componentes de paseos
│   │   │   └── chat/           # Chat interno
│   │   ├── hooks/
│   │   ├── lib/
│   │   └── public/
│   │
│   └── api/                    # NestJS — Backend
│       └── src/
│           ├── modules/
│           │   ├── auth/        # Login, registro, JWT
│           │   ├── users/       # Usuario base
│           │   ├── owners/      # Perfil dueño
│           │   ├── walkers/     # Perfil paseador + verificación
│           │   ├── dogs/        # Mascotas
│           │   ├── walks/       # Core: reservas y paseos
│           │   ├── tracking/    # GPS real-time (Socket.io gateway)
│           │   ├── chat/        # Mensajería interna
│           │   ├── payments/    # MercadoPago integration
│           │   ├── reviews/     # Ratings y reseñas
│           │   ├── notifications/ # Push + email
│           │   └── admin/       # Panel admin
│           ├── common/
│           │   ├── guards/      # AuthGuard, RolesGuard
│           │   ├── decorators/  # @CurrentUser, @Roles
│           │   ├── filters/     # ExceptionFilter global
│           │   ├── interceptors/ # LoggingInterceptor
│           │   └── pipes/       # ValidationPipe
│           ├── database/
│           │   └── migrations/
│           └── main.ts
│
├── packages/
│   └── shared/                 # Tipos TypeScript compartidos
│       ├── types/
│       └── constants/
│
├── package.json                # Root (workspaces)
├── turbo.json
├── .env.example
└── README.md
```

---

## 4. SCHEMA DE BASE DE DATOS (PostgreSQL + Prisma)

```prisma
// schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ─── ENUMS ───────────────────────────────────────────────

enum UserRole {
  OWNER
  WALKER
  ADMIN
}

enum VerificationStatus {
  PENDING
  VERIFIED
  REJECTED
}

enum WalkStatus {
  PENDING          // Dueño reservó, espera confirmación
  CONFIRMED        // Paseador aceptó
  WALKER_ON_WAY    // Paseador en camino al pickup
  IN_PROGRESS      // Paseo activo (GPS activo)
  COMPLETED        // Paseo finalizado
  CANCELLED_OWNER
  CANCELLED_WALKER
}

enum WalkMode {
  GRUPAL     // Varios perros de distintos dueños
  EXCLUSIVO  // Un solo dueño (premium)
}

enum PayoutStatus {
  PENDING
  PROCESSING
  COMPLETED
  FAILED
}

// ─── USUARIOS ────────────────────────────────────────────

model User {
  id            String   @id @default(uuid())
  email         String   @unique
  phone         String?
  passwordHash  String
  firstName     String
  lastName      String
  avatarUrl     String?
  role          UserRole
  isActive      Boolean  @default(true)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  ownerProfile   OwnerProfile?
  walkerProfile  WalkerProfile?
  sentMessages   Message[]     @relation("SentMessages")
  notifications  Notification[]
  reviewsGiven   Review[]      @relation("ReviewsGiven")
  reviewsReceived Review[]     @relation("ReviewsReceived")
}

// ─── PERFIL DUEÑO ────────────────────────────────────────

model OwnerProfile {
  id            String  @id @default(uuid())
  userId        String  @unique
  user          User    @relation(fields: [userId], references: [id])
  address       String?
  neighborhood  String?
  lat           Float?
  lng           Float?

  dogs          Dog[]
  walkParticipants WalkParticipant[]
  conversations Conversation[]
}

// ─── PERFIL PASEADOR ─────────────────────────────────────

model WalkerProfile {
  id                  String             @id @default(uuid())
  userId              String             @unique
  user                User               @relation(fields: [userId], references: [id])
  bio                 String?
  dniNumber           String?
  dniPhotoUrl         String?
  selfieUrl           String?
  verificationStatus  VerificationStatus @default(PENDING)
  verificationNotes   String?            // Notas internas del admin
  rating              Float              @default(0)
  totalReviews        Int                @default(0)
  isAvailable         Boolean            @default(false)
  maxDogsPerWalk      Int                @default(6)
  centerLat           Float?             // Centro de su zona de operación
  centerLng           Float?
  radiusKm            Float?             // Radio de operación en km
  mpAccessToken       String?            // Token MercadoPago del paseador
  mpUserId            String?            // ID usuario MP del paseador

  schedules     WalkerSchedule[]
  walks         Walk[]
  payouts       Payout[]
  conversations Conversation[]
}

// ─── HORARIOS DEL PASEADOR ───────────────────────────────

model WalkerSchedule {
  id          String        @id @default(uuid())
  walkerId    String
  walker      WalkerProfile @relation(fields: [walkerId], references: [id])
  dayOfWeek   Int           // 0=Domingo, 1=Lunes, ..., 6=Sábado
  startTime   String        // "08:00"
  endTime     String        // "14:00"
  isActive    Boolean       @default(true)
}

// ─── PERROS ──────────────────────────────────────────────

model Dog {
  id          String       @id @default(uuid())
  ownerId     String
  owner       OwnerProfile @relation(fields: [ownerId], references: [id])
  name        String
  breed       String?
  size        String       // "small" | "medium" | "large"
  ageYears    Int?
  weightKg    Float?
  photoUrl    String?
  notes       String?      // Condiciones médicas, comportamiento
  isActive    Boolean      @default(true)
  createdAt   DateTime     @default(now())

  walkParticipants WalkParticipant[]
}

// ─── TIPOS DE PASEO (PRICING) ────────────────────────────

model WalkType {
  id                  String  @id @default(uuid())
  durationMinutes     Int     // 45, 90, 120, 180
  label               String  // "45 min", "90 min", "2 hs", "3 hs"
  basePrice           Float   // 3000, 4500, 5500, 6500
  exclusiveMultiplier Float   @default(1.5) // precio exclusivo = base * multiplier
  isActive            Boolean @default(true)

  walks Walk[]
}

// ─── PASEOS ──────────────────────────────────────────────

model Walk {
  id                 String        @id @default(uuid())
  walkTypeId         String
  walkType           WalkType      @relation(fields: [walkTypeId], references: [id])
  walkerId           String
  walker             WalkerProfile @relation(fields: [walkerId], references: [id])
  mode               WalkMode      @default(GRUPAL)
  status             WalkStatus    @default(PENDING)
  scheduledAt        DateTime      // Cuando está programado
  startedAt          DateTime?     // Cuando el paseador inicia
  endedAt            DateTime?     // Cuando termina
  pickupLat          Float
  pickupLng          Float
  pickupAddress      String
  totalAmount        Float         // Total cobrado a todos los dueños
  platformFee        Float         // Lo que se queda Güau
  walkerAmount       Float         // Lo que recibe el paseador
  commissionRate     Float         // Ej: 0.15 = 15%
  mpPaymentId        String?       // ID del pago en MercadoPago
  cancellationReason String?
  createdAt          DateTime      @default(now())
  updatedAt          DateTime      @updatedAt

  participants  WalkParticipant[]
  locations     WalkLocation[]
  reviews       Review[]
  conversation  Conversation?
}

// ─── PARTICIPANTES DEL PASEO ─────────────────────────────

model WalkParticipant {
  id          String       @id @default(uuid())
  walkId      String
  walk        Walk         @relation(fields: [walkId], references: [id])
  ownerId     String
  owner       OwnerProfile @relation(fields: [ownerId], references: [id])
  dogId       String
  dog         Dog          @relation(fields: [dogId], references: [id])
  amountPaid  Float        // Lo que pagó este dueño específicamente
  joinedAt    DateTime     @default(now())

  @@unique([walkId, dogId])
}

// ─── TRACKING GPS ────────────────────────────────────────

model WalkLocation {
  id          String   @id @default(uuid())
  walkId      String
  walk        Walk     @relation(fields: [walkId], references: [id])
  lat         Float
  lng         Float
  recordedAt  DateTime @default(now())

  @@index([walkId, recordedAt])
}

// ─── REVIEWS ─────────────────────────────────────────────

model Review {
  id          String   @id @default(uuid())
  walkId      String
  walk        Walk     @relation(fields: [walkId], references: [id])
  reviewerId  String
  reviewer    User     @relation("ReviewsGiven", fields: [reviewerId], references: [id])
  revieweeId  String
  reviewee    User     @relation("ReviewsReceived", fields: [revieweeId], references: [id])
  rating      Int      // 1-5
  comment     String?
  createdAt   DateTime @default(now())

  @@unique([walkId, reviewerId])
}

// ─── CHAT ────────────────────────────────────────────────

model Conversation {
  id        String        @id @default(uuid())
  walkId    String?       @unique
  walk      Walk?         @relation(fields: [walkId], references: [id])
  ownerId   String
  owner     OwnerProfile  @relation(fields: [ownerId], references: [id])
  walkerId  String
  walker    WalkerProfile @relation(fields: [walkerId], references: [id])
  createdAt DateTime      @default(now())

  messages Message[]
}

model Message {
  id                  String       @id @default(uuid())
  conversationId      String
  conversation        Conversation @relation(fields: [conversationId], references: [id])
  senderId            String
  sender              User         @relation("SentMessages", fields: [senderId], references: [id])
  content             String
  isRead              Boolean      @default(false)
  containsContactInfo Boolean      @default(false) // Flaggeado por el sistema
  createdAt           DateTime     @default(now())
}

// ─── NOTIFICACIONES ──────────────────────────────────────

model Notification {
  id        String   @id @default(uuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  title     String
  body      String
  type      String   // "walk_confirmed", "walker_on_way", "walk_completed", etc.
  data      Json?    // Metadata adicional (walkId, etc.)
  isRead    Boolean  @default(false)
  createdAt DateTime @default(now())
}

// ─── PAGOS A PASEADORES ──────────────────────────────────

model Payout {
  id            String        @id @default(uuid())
  walkerId      String
  walker        WalkerProfile @relation(fields: [walkerId], references: [id])
  amount        Float
  periodStart   DateTime
  periodEnd     DateTime
  status        PayoutStatus  @default(PENDING)
  mpTransferId  String?
  createdAt     DateTime      @default(now())
}
```

---

## 5. TIPOS DE PASEO — PRECIOS INICIALES

| ID | Duración | Label | Precio grupal | Precio exclusivo (x1.5) |
|----|---------|-------|--------------|------------------------|
| 1 | 45 min | "45 min" | $3.000 ARS | $4.500 ARS |
| 2 | 90 min | "90 min" | $4.500 ARS | $6.750 ARS |
| 3 | 120 min | "2 hs" | $5.500 ARS | $8.250 ARS |
| 4 | 180 min | "3 hs" | $6.500 ARS | $9.750 ARS |

> Nota: Los horarios son estimados. Si el dueño solicita al paseador retornar antes, se cobra el mínimo (45 min). Los precios viven en la tabla `walk_types` de la DB y se modifican sin tocar código.

---

## 6. FLUJOS DE USUARIO

### 6.1 Registro Dueño
```
Ingresa email + contraseña
→ Verifica email (link)
→ Completa perfil (nombre, teléfono, dirección, barrio)
→ Agrega su/s perro/s (nombre, raza, tamaño, foto, notas)
→ Dashboard dueño
```

### 6.2 Registro Paseador
```
Ingresa email + contraseña
→ Verifica email
→ Completa perfil (nombre, teléfono, bio, foto)
→ Sube DNI (frente + dorso) + selfie con DNI
→ Define zona de operación (círculo en mapa)
→ Define horarios disponibles por día
→ Conecta cuenta MercadoPago (OAuth)
→ Estado: PENDING (espera verificación manual del admin)
→ Admin aprueba → Estado: VERIFIED → Activo en la plataforma
```

### 6.3 Reserva de Paseo
```
Dueño abre app
→ Ve mapa con paseadores disponibles en su zona
→ Filtra por horario / tipo de paseo / rating
→ Selecciona paseador → ve perfil, reviews, foto
→ Elige perro/s, tipo de paseo, horario
→ Paga con tarjeta/MP (hold del monto)
→ Paseador recibe notificación → acepta o rechaza (15 min para responder)
→ Si acepta: Reserva CONFIRMADA, dueño notificado
→ Si rechaza/no responde: Pago devuelto automáticamente
```

### 6.4 Durante el Paseo
```
A la hora programada: Paseador inicia "En camino"
→ Dueño ve en mapa la ubicación del paseador en tiempo real
→ Paseador llega → "Iniciar paseo" → GPS tracking activo
→ Dueño ve ruta del paseo en tiempo real
→ Paseador finaliza → "Finalizar paseo"
→ Pago se libera: split automático MP (plataforma + paseador)
→ Dueño y paseador se califican mutuamente (1-5 estrellas + comentario)
```

### 6.5 Paseo Grupal (múltiples dueños)
```
El paseador publica un turno disponible con cupo (ej: hasta 6 perros)
→ Múltiples dueños pueden reservar ese mismo turno
→ Cada dueño paga por separado su parte
→ El paseador sale con todos los perros del turno
→ El pago de cada dueño se procesa individualmente
→ El paseador recibe la suma total menos la comisión
```

---

## 7. ENDPOINTS API (NestJS)

### Auth
```
POST /auth/register/owner       Registro dueño
POST /auth/register/walker      Registro paseador
POST /auth/login                Login (retorna JWT + refresh token)
POST /auth/refresh              Renovar JWT
POST /auth/logout               Invalidar refresh token
POST /auth/verify-email/:token  Verificar email
```

### Owners
```
GET  /owners/me                 Perfil propio
PUT  /owners/me                 Actualizar perfil
```

### Walkers
```
GET  /walkers                   Buscar paseadores (con filtros: lat, lng, date, walkTypeId)
GET  /walkers/:id               Perfil público de un paseador
GET  /walkers/me                Mi perfil (paseador autenticado)
PUT  /walkers/me                Actualizar perfil
PUT  /walkers/me/availability   Activar/desactivar disponibilidad
POST /walkers/me/schedules      Crear horario
PUT  /walkers/me/schedules/:id  Editar horario
POST /walkers/me/zone           Definir zona de operación
```

### Dogs
```
GET  /dogs                      Mis perros
POST /dogs                      Agregar perro
PUT  /dogs/:id                  Editar perro
DEL  /dogs/:id                  Desactivar perro
```

### Walks
```
POST /walks                     Crear reserva
GET  /walks                     Mis paseos (dueño o paseador)
GET  /walks/:id                 Detalle de un paseo
PUT  /walks/:id/confirm         Paseador confirma
PUT  /walks/:id/reject          Paseador rechaza
PUT  /walks/:id/on-way          Paseador en camino
PUT  /walks/:id/start           Iniciar paseo
PUT  /walks/:id/finish          Finalizar paseo
PUT  /walks/:id/cancel          Cancelar (dueño o paseador)
GET  /walks/:id/locations       Ruta GPS del paseo
```

### Reviews
```
POST /reviews                   Crear review post-paseo
GET  /reviews/walker/:id        Reviews de un paseador
```

### Chat
```
GET  /conversations             Mis conversaciones
GET  /conversations/:id/messages  Mensajes de una conversación
POST /conversations/:id/messages  Enviar mensaje
```

### Payments
```
POST /payments/create-preference   Crear preferencia MP
POST /payments/webhook             Webhook de MP (confirmación de pago)
GET  /payments/walker-balance      Balance del paseador
```

### Notifications
```
GET  /notifications             Mis notificaciones
PUT  /notifications/:id/read    Marcar como leída
```

### Admin
```
GET  /admin/walkers/pending     Paseadores pendientes de verificación
PUT  /admin/walkers/:id/verify  Aprobar/rechazar paseador
GET  /admin/walks               Todos los paseos
GET  /admin/stats               Métricas generales
POST /admin/payouts/process     Procesar pagos semanales
```

---

## 8. SOCKET.IO — EVENTOS REAL-TIME

```typescript
// Cliente → Servidor
'walk:join'          // Unirse a sala de un paseo (walkId)
'walk:location'      // Paseador envía ubicación { lat, lng, walkId }
'walk:leave'         // Salir de sala

// Servidor → Cliente
'walk:location:update'    // Nueva ubicación del paseador
'walk:status:changed'     // Cambio de estado del paseo
'notification:new'        // Nueva notificación push
'message:new'             // Nuevo mensaje de chat
```

---

## 9. INTEGRACIONES EXTERNAS

### MercadoPago Marketplace
- Flujo: Paseador conecta su cuenta MP via OAuth (MP Connect)
- Al pagar: se crea un `payment` con `marketplace_fee` (la comisión de Güau)
- El dinero va directo a la cuenta del paseador menos la comisión
- Documentación: https://www.mercadopago.com.ar/developers/es/docs/marketplace/landing

### Mapbox
- Frontend: `mapbox-gl` para mostrar el mapa
- Búsqueda de paseadores: círculo de radio desde la ubicación del dueño
- Zona del paseador: se dibuja como círculo sobre el mapa
- Tracking: línea que se actualiza en tiempo real vía Socket.io

### Cloudflare R2
- Fotos de perfil, fotos de perros, fotos de DNI
- SDK: `@aws-sdk/client-s3` (R2 es compatible con S3 API)
- Acceso a fotos de DNI: solo accesible por admin (bucket privado)

### Resend (emails)
- Verificación de email al registrarse
- Confirmación de reserva
- Recordatorio 1 hora antes del paseo
- Comprobante de pago

---

## 10. VARIABLES DE ENTORNO (.env.example)

```bash
# Base de datos
DATABASE_URL="postgresql://user:password@host:5432/guau"

# JWT
JWT_SECRET="super-secret-key"
JWT_EXPIRES_IN="15m"
JWT_REFRESH_SECRET="another-secret"
JWT_REFRESH_EXPIRES_IN="7d"

# MercadoPago
MP_ACCESS_TOKEN=""
MP_CLIENT_ID=""
MP_CLIENT_SECRET=""
MP_MARKETPLACE_FEE=0.15   # 15% comisión base
MP_WEBHOOK_SECRET=""

# Cloudflare R2
R2_ACCOUNT_ID=""
R2_ACCESS_KEY_ID=""
R2_SECRET_ACCESS_KEY=""
R2_BUCKET_NAME="guau-storage"
R2_PUBLIC_URL=""

# Mapbox
NEXT_PUBLIC_MAPBOX_TOKEN=""

# Resend (emails)
RESEND_API_KEY=""
EMAIL_FROM="noreply@guau.com.ar"

# App URLs
API_URL="http://localhost:3001"
NEXT_PUBLIC_API_URL="http://localhost:3001"
NEXT_PUBLIC_WS_URL="ws://localhost:3001"
```

---

## 11. PROTECCIÓN ANTI-FUGA (off-platform)

Implementar en el módulo de chat:

```typescript
// Detectar info de contacto en mensajes
const CONTACT_PATTERNS = [
  /\b\d{10,11}\b/,                          // Teléfonos argentinos
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/, // Emails
  /whatsapp/i,
  /wasap/i,
  /instagram/i,
  /insta\b/i,
  /ig\b/i,
  /@[a-zA-Z0-9._]+/,                        // @usuario
];

// Si detecta → containsContactInfo = true → alerta al admin
// El mensaje se envía igual (no censuramos) pero queda registrado
```

---

## 12. MODELO LEGAL (resumen para T&C)

- **Güau** actúa como **plataforma tecnológica de intermediación**, no como prestador del servicio de paseo.
- Los paseadores son **monotributistas independientes**, no empleados de Güau.
- La responsabilidad civil del servicio recae sobre el **paseador**.
- Cada paseador debe contar con **seguro de responsabilidad civil** propio como requisito de activación.
- Güau retiene una comisión del **10-20%** como fee de plataforma por el servicio de intermediación y pago.
- Los pagos semanales a paseadores se procesan cada **lunes** por los paseos completados la semana anterior.

---

## 13. ROADMAP MVP (6-8 semanas)

### Semana 1-2: Fundación
- [ ] Setup monorepo (Turborepo + Next.js + NestJS)
- [ ] PostgreSQL en Railway + Prisma schema + migraciones
- [ ] Auth completo (registro, login, JWT, refresh, verificación email)
- [ ] Upload de archivos a Cloudflare R2
- [ ] Seed de datos: WalkTypes con precios

### Semana 3-4: Core del producto
- [ ] Perfil paseador (horarios, zona en mapa Mapbox, fotos, DNI)
- [ ] Perfil dueño + gestión de perros
- [ ] Búsqueda de paseadores por ubicación y horario
- [ ] Sistema de reservas (crear, confirmar, rechazar)

### Semana 5-6: Dinero y tiempo real
- [ ] Integración MercadoPago Marketplace (pago + split + webhook)
- [ ] GPS tracking en tiempo real (Socket.io)
- [ ] Chat interno con detección de contacto
- [ ] Sistema de reviews post-paseo

### Semana 7-8: Pulir y lanzar
- [ ] Notificaciones push (Web Push API)
- [ ] Emails transaccionales (Resend)
- [ ] Panel admin (verificación de paseadores, métricas básicas)
- [ ] PWA manifest + service worker
- [ ] Testing end-to-end de flujo principal
- [ ] Deploy producción (Railway + Vercel)

---

## 14. INSTRUCCIONES PARA CLAUDE CODE

Al iniciar una sesión de Claude Code con este proyecto, proporcionar este contexto:

> "Estamos construyendo Güau, un marketplace de paseo de perros para Buenos Aires. Stack: Next.js 14 (frontend PWA) + NestJS (backend API) + PostgreSQL con Prisma como ORM. El blueprint completo está en guau-blueprint.md. Arrancamos por [TAREA ESPECÍFICA]. No toques lo que no sea necesario para esa tarea."

**Orden de construcción recomendada:**
1. Setup del monorepo
2. Schema de DB + migraciones
3. Módulo Auth
4. Módulo Walkers
5. Módulo Dogs
6. Módulo Walks
7. Pagos (MercadoPago)
8. Real-time (Socket.io)
9. Chat
10. Admin panel
11. PWA + notificaciones

---

*Blueprint v1.0 — Güau — Junio 2026*
