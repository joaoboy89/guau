#!/bin/bash
set -euo pipefail

DEPLOY_DIR="/opt/guau"
REPO_URL="https://github.com/joaoboy89/guau.git"

echo ""
echo "╔═══════════════════════════════╗"
echo "║       Güau — Deploy VPS       ║"
echo "╚═══════════════════════════════╝"
echo ""

# Verificar .env
if [ ! -f "$DEPLOY_DIR/.env" ]; then
  echo "✗ ERROR: Falta /opt/guau/.env"
  echo "  Copiá .env.example, completá los valores y volvé a correr este script."
  exit 1
fi

# Clonar o actualizar el repo
if [ -d "$DEPLOY_DIR/repo/.git" ]; then
  echo "→ Actualizando código..."
  cd "$DEPLOY_DIR/repo" && git pull
else
  echo "→ Clonando repo..."
  git clone "$REPO_URL" "$DEPLOY_DIR/repo"
fi

# Copiar compose al directorio de trabajo
cp "$DEPLOY_DIR/repo/infra/vps/docker-compose.yml" "$DEPLOY_DIR/docker-compose.yml"

# Build y levantar (sin tocar otros servicios del VPS)
cd "$DEPLOY_DIR"
echo "→ Levantando contenedores..."
docker compose up -d --build

# Esperar que la API esté lista
echo "→ Esperando que la API esté lista..."
ATTEMPTS=0
until docker exec guau_api wget -qO- http://localhost:3001/docs > /dev/null 2>&1; do
  ATTEMPTS=$((ATTEMPTS + 1))
  if [ $ATTEMPTS -ge 20 ]; then
    echo "✗ Timeout. Revisá los logs: docker logs guau_api"
    exit 1
  fi
  echo "   ($ATTEMPTS/20) esperando..."
  sleep 5
done

# Seed inicial (solo tiene efecto la primera vez)
echo "→ Cargando datos iniciales (tipos de paseo)..."
docker exec guau_api sh -c "cd apps/api && npx prisma db seed" 2>/dev/null \
  && echo "   Seed OK" \
  || echo "   (seed ya fue corrido antes — OK)"

echo ""
IP=$(hostname -I | awk '{print $1}')
echo "✓ Güau API corriendo"
echo "  → API:     http://$IP:3001"
echo "  → Swagger: http://$IP:3001/docs"
echo ""
echo "Logs en vivo: docker logs -f guau_api"
