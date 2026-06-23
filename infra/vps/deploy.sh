#!/bin/bash
set -euo pipefail

DEPLOY_DIR="/opt/guau"
REPO_DIR="$DEPLOY_DIR/repo"
REPO="joaoboy89/guau"
IMAGE="ghcr.io/joaoboy89/guau-api:latest"

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

# ── Actualizar repo (para tener el docker-compose.yml actualizado) ─
if [ -d "$REPO_DIR/.git" ]; then
  echo "→ Actualizando repo..."
  cd "$REPO_DIR"
  git remote set-url origin "https://$GH_TOKEN@github.com/$REPO.git"
  git pull
else
  echo "→ Clonando repo..."
  git clone "https://$GH_TOKEN@github.com/$REPO.git" "$REPO_DIR"
fi

cp "$REPO_DIR/infra/vps/docker-compose.yml" "$DEPLOY_DIR/docker-compose.yml"

# ── Bajar imagen (paquete público, sin auth) ─────────────────
echo "→ Bajando imagen $IMAGE..."
docker pull "$IMAGE"

# ── Levantar servicios ────────────────────────────────────────
cd "$DEPLOY_DIR"
echo "→ Levantando contenedores..."
docker compose up -d

# ── Esperar que la API responda ───────────────────────────────
echo "→ Esperando que la API responda..."
ATTEMPTS=0
until docker exec guau_api wget -qO- http://localhost:3001/docs > /dev/null 2>&1; do
  ATTEMPTS=$((ATTEMPTS + 1))
  if [ $ATTEMPTS -ge 24 ]; then
    echo ""
    echo "✗ Timeout. Revisá los logs: docker logs guau_api"
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

# ── Resultado ─────────────────────────────────────────────────
echo ""
echo "✓ Güau corriendo"
echo "  → API:     http://38.54.57.20:3001"
echo "  → Swagger: http://38.54.57.20:3001/docs"
echo ""
echo "Comandos útiles:"
echo "  docker logs -f guau_api    # logs en vivo"
echo "  docker compose -f $DEPLOY_DIR/docker-compose.yml ps"
