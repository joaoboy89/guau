#!/bin/bash
set -euo pipefail

DEPLOY_DIR="/opt/guau"
REPO_DIR="$DEPLOY_DIR/repo"
REPO="joaoboy89/guau"

echo ""
echo "╔═══════════════════════════════╗"
echo "║       Güau — Deploy VPS       ║"
echo "╚═══════════════════════════════╝"
echo ""

# ── Verificar .env ────────────────────────────────────────────
if [ ! -f "$DEPLOY_DIR/.env" ]; then
  echo "✗ ERROR: Falta /opt/guau/.env"
  echo "  Copiá .env.example, completá los valores y volvé a correr el script."
  exit 1
fi

source "$DEPLOY_DIR/.env"

if [ -z "${GH_TOKEN:-}" ]; then
  echo "✗ ERROR: GH_TOKEN no está definido en /opt/guau/.env"
  exit 1
fi

# ── Swap temporal para el build (evita OOM con 1.5GB RAM) ─────
SWAP_CREATED=false
if [ ! -f /swapfile ]; then
  echo "→ Creando swap de 1GB para el build..."
  fallocate -l 1G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  SWAP_CREATED=true
  echo "   Swap activo."
fi

# ── Clonar o actualizar el repo ───────────────────────────────
if [ -d "$REPO_DIR/.git" ]; then
  echo "→ Actualizando código..."
  cd "$REPO_DIR"
  git remote set-url origin "https://$GH_TOKEN@github.com/$REPO.git"
  git pull
else
  echo "→ Clonando repo privado..."
  git clone "https://$GH_TOKEN@github.com/$REPO.git" "$REPO_DIR"
fi

# Copiar el compose al directorio de trabajo
cp "$REPO_DIR/infra/vps/docker-compose.yml" "$DEPLOY_DIR/docker-compose.yml"

# ── Build y levantar ──────────────────────────────────────────
cd "$DEPLOY_DIR"
echo "→ Levantando contenedores..."
docker compose up -d --build

# ── Eliminar swap si lo creamos nosotros ──────────────────────
if [ "$SWAP_CREATED" = true ]; then
  echo "→ Liberando swap temporal..."
  swapoff /swapfile
  rm /swapfile
fi

# ── Esperar que la API esté lista ────────────────────────────
echo "→ Esperando que la API responda..."
ATTEMPTS=0
until docker exec guau_api wget -qO- http://localhost:3001/docs > /dev/null 2>&1; do
  ATTEMPTS=$((ATTEMPTS + 1))
  if [ $ATTEMPTS -ge 24 ]; then
    echo ""
    echo "✗ Timeout esperando la API. Revisá los logs:"
    echo "  docker logs guau_api"
    exit 1
  fi
  printf "   (%d/24) esperando...\r" "$ATTEMPTS"
  sleep 5
done
echo ""

# ── Seed: tipos de paseo (solo tiene efecto la primera vez) ───
echo "→ Cargando tipos de paseo..."
docker exec guau_postgres psql -U guau -d guau -c "
INSERT INTO \"WalkType\" (id, name, description, \"durationMinutes\", \"basePrice\", \"createdAt\", \"updatedAt\")
VALUES
  (gen_random_uuid(), 'Paseo 45 min',  'Paseo básico ideal para rutina diaria',      45,  3000, NOW(), NOW()),
  (gen_random_uuid(), 'Paseo 90 min',  'Paseo estándar con exploración del barrio',  90,  4500, NOW(), NOW()),
  (gen_random_uuid(), 'Paseo 2 horas', 'Paseo largo con ejercicio intenso',          120, 5500, NOW(), NOW()),
  (gen_random_uuid(), 'Paseo 3 horas', 'Paseo premium, ideal para perros activos',   180, 6500, NOW(), NOW())
ON CONFLICT DO NOTHING;
" 2>/dev/null && echo "   Seed OK." || echo "   (tipos ya existían — OK)"

# ── Resultado ─────────────────────────────────────────────────
echo ""
echo "✓ Güau está corriendo"
echo "  → API:     http://38.54.57.20:3001"
echo "  → Swagger: http://38.54.57.20:3001/docs"
echo ""
echo "Comandos útiles:"
echo "  docker logs -f guau_api       # logs en vivo"
echo "  docker compose -f $DEPLOY_DIR/docker-compose.yml ps  # estado"
