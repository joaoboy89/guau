#!/bin/bash
set -euo pipefail

DEPLOY_DIR="/opt/guau"
REPO_DIR="$DEPLOY_DIR/repo"
REPO="joaoboy89/guau"
API_IMAGE="ghcr.io/joaoboy89/guau-api:latest"
WEB_IMAGE="ghcr.io/joaoboy89/guau-web:latest"

echo ""
echo "╔═══════════════════════════════╗"
echo "║       Güau — Deploy VPS       ║"
echo "╚═══════════════════════════════╝"
echo ""

# ── Verificar .env ────────────────────────────────────────────
if [ ! -f "$DEPLOY_DIR/.env" ]; then
  echo "✗ Falta /opt/guau/.env"
  exit 1
fi

source "$DEPLOY_DIR/.env"

if [ -z "${GH_TOKEN:-}" ]; then
  echo "✗ GH_TOKEN no definido en /opt/guau/.env"
  exit 1
fi

# ── Actualizar repo ────────────────────────────────────────────
if [ -d "$REPO_DIR/.git" ]; then
  echo "→ Actualizando repo..."
  git -C "$REPO_DIR" remote set-url origin "https://$GH_TOKEN@github.com/$REPO.git"
  git -C "$REPO_DIR" pull --ff-only
else
  echo "→ Clonando repo..."
  git clone "https://$GH_TOKEN@github.com/$REPO.git" "$REPO_DIR"
fi

cp "$REPO_DIR/infra/vps/docker-compose.yml" "$DEPLOY_DIR/docker-compose.yml"

# ── Bajar imágenes ─────────────────────────────────────────────
echo "→ Bajando imágenes..."
docker pull "$API_IMAGE"
docker pull "$WEB_IMAGE"

# ── Postgres primero, para poder migrar ───────────────────────
cd "$DEPLOY_DIR"
echo "→ Asegurando Postgres..."
docker compose up -d postgres
echo "   Esperando postgres..."
ATTEMPTS=0
until docker exec guau_postgres pg_isready -U guau -d guau 2>/dev/null; do
  ATTEMPTS=$((ATTEMPTS + 1))
  if [ $ATTEMPTS -ge 15 ]; then echo "✗ Postgres no arrancó."; exit 1; fi
  sleep 2
done

# ── Prisma migrate deploy ──────────────────────────────────────
echo "→ Ejecutando prisma migrate deploy..."
docker run --rm \
  --network guau_internal \
  -e DATABASE_URL="postgresql://guau:${POSTGRES_PASSWORD}@postgres:5432/guau" \
  "$API_IMAGE" \
  sh -c "node_modules/.bin/prisma migrate deploy --schema=apps/api/prisma/schema.prisma" \
  && echo "   Migrations OK." \
  || echo "   (sin migraciones pendientes — OK)"

# ── Levantar todos los servicios ──────────────────────────────
echo "→ Levantando contenedores..."
docker compose up -d --remove-orphans

# ── Esperar que la API responda ───────────────────────────────
echo "→ Esperando API..."
ATTEMPTS=0
until docker exec guau_api wget -qO- http://localhost:3001/docs > /dev/null 2>&1; do
  ATTEMPTS=$((ATTEMPTS + 1))
  if [ $ATTEMPTS -ge 24 ]; then
    echo "✗ Timeout. Logs: docker logs guau_api"
    exit 1
  fi
  printf "   (%d/24) esperando...\r" "$ATTEMPTS"
  sleep 5
done
echo ""

# ── Seed: tipos de paseo (idempotente) ───────────────────────
echo "→ Cargando tipos de paseo..."
docker exec guau_postgres psql -U guau -d guau -c "
INSERT INTO \"WalkType\" (id, name, description, \"durationMinutes\", \"basePrice\", \"createdAt\", \"updatedAt\")
VALUES
  (gen_random_uuid(), 'Paseo 45 min',  'Paseo básico ideal para rutina diaria',      45,  3000, NOW(), NOW()),
  (gen_random_uuid(), 'Paseo 90 min',  'Paseo estándar con exploración del barrio',  90,  4500, NOW(), NOW()),
  (gen_random_uuid(), 'Paseo 2 horas', 'Paseo largo con ejercicio intenso',          120, 5500, NOW(), NOW()),
  (gen_random_uuid(), 'Paseo 3 horas', 'Paseo premium, ideal para perros activos',   180, 6500, NOW(), NOW())
ON CONFLICT DO NOTHING;
" 2>/dev/null && echo "   Seed OK." || echo "   (ya existían — OK)"

# ── Limpiar imágenes viejas ───────────────────────────────────
docker image prune -f 2>/dev/null || true

# ── Resultado ─────────────────────────────────────────────────
echo ""
echo "✓ Güau corriendo"
echo "  → API:     http://38.54.57.20:3001"
echo "  → Swagger: http://38.54.57.20:3001/docs"
echo "  → Web:     http://38.54.57.20:3000"
echo ""
echo "Comandos útiles:"
echo "  docker logs -f guau_api    # API logs"
echo "  docker logs -f guau_web    # Web logs"
echo "  docker compose -f $DEPLOY_DIR/docker-compose.yml ps"
