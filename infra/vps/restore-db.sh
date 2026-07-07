#!/usr/bin/env bash
# =============================================================================
# restore-db.sh — Restaurar un backup de Postgres
# =============================================================================
#
# ╔══════════════════════════════════════════════════════════════════════════╗
# ║  PELIGRO: este script PISA la base de datos destino por completo.       ║
# ║  Todas las tablas se recrean desde el dump. No hay rollback automático. ║
# ║  Úsalo solo si sabés exactamente lo que estás haciendo.                 ║
# ╚══════════════════════════════════════════════════════════════════════════╝
#
# USO
# ---
#   TARGET_DB=guau ./restore-db.sh /ruta/al/guau-2026-07-07-0400.dump
#
#   TARGET_DB:  base de datos destino (default: guau).
#               Usá un nombre diferente para hacer una restauración de prueba
#               sin tocar la base de producción.
#   CONTAINER:  contenedor de Postgres (default: guau_postgres).
#
# Para probar contra el Postgres local de dev (sin tocar el VPS):
#   CONTAINER=guau_postgres_dev POSTGRES_PASSWORD=devpassword TARGET_DB=guau_restore_test \
#     ./restore-db.sh /tmp/dump.dump
#
# PASOS TÍPICOS DE RECUPERACIÓN
# ------------------------------
# 1. Bajar el dump de R2:
#      rclone copy r2:guau-backups/guau-YYYY-MM-DD-HHMM.dump /tmp/
#
# 2. (Recomendado) Restaurar primero en una DB de prueba:
#      TARGET_DB=guau_restore_test ./restore-db.sh /tmp/guau-YYYY-MM-DD-HHMM.dump
#
# 3. Verificar que los datos se ven bien antes de pisar la producción.
#
# 4. Si todo está bien, restaurar sobre la DB real:
#      TARGET_DB=guau ./restore-db.sh /tmp/guau-YYYY-MM-DD-HHMM.dump
#
# 5. Reiniciar el contenedor de la API para que Prisma reconecte:
#      docker compose up -d api
#
# =============================================================================

set -euo pipefail

# ─── Configuración ────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/.env"
CONTAINER="${CONTAINER:-guau_postgres}"
DB_USER="guau"
TARGET_DB="${TARGET_DB:-guau}"

# ─── Logging ──────────────────────────────────────────────────────────────────

log() { echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*"; }
trap 'log "ERROR: script fallido en línea $LINENO"' ERR

# ─── Validar argumento ────────────────────────────────────────────────────────

if [ $# -ne 1 ]; then
  echo "Uso: TARGET_DB=<db> $0 <archivo.dump>"
  exit 1
fi

DUMP_FILE="$1"

if [ ! -f "${DUMP_FILE}" ]; then
  echo "Error: archivo '${DUMP_FILE}' no encontrado"
  exit 1
fi

# ─── Cargar variables de entorno ──────────────────────────────────────────────

if [ -f "${ENV_FILE}" ]; then
  set -a
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +a
fi

: "${POSTGRES_PASSWORD:?'Variable POSTGRES_PASSWORD no seteada'}"

# ─── Confirmación explícita ───────────────────────────────────────────────────

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  ATENCIÓN: esto va a PISAR la base '${TARGET_DB}' en '${CONTAINER}'."
echo "║  Dump a restaurar: ${DUMP_FILE}"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
read -r -p "¿Confirmar? Escribí 'si' para continuar: " CONFIRM

if [ "${CONFIRM}" != "si" ]; then
  echo "Cancelado."
  exit 0
fi

# ─── pg_restore ───────────────────────────────────────────────────────────────

log "Restaurando '${DUMP_FILE}' en '${TARGET_DB}' (contenedor: ${CONTAINER})..."

# Copiar el dump dentro del contenedor y restaurar desde adentro
CONTAINER_DUMP="/tmp/$(basename "${DUMP_FILE}")"

docker cp "${DUMP_FILE}" "${CONTAINER}:${CONTAINER_DUMP}"

docker exec \
  -e PGPASSWORD="${POSTGRES_PASSWORD}" \
  "${CONTAINER}" \
  createdb -U "${DB_USER}" "${TARGET_DB}" 2>/dev/null || true

docker exec \
  -e PGPASSWORD="${POSTGRES_PASSWORD}" \
  "${CONTAINER}" \
  pg_restore \
    --clean \
    --if-exists \
    --no-owner \
    --no-privileges \
    -U "${DB_USER}" \
    -d "${TARGET_DB}" \
    "${CONTAINER_DUMP}"

docker exec "${CONTAINER}" rm -f "${CONTAINER_DUMP}"

log "Restauración completada en '${TARGET_DB}'"
log "Si restauraste en producción, reiniciá la API: docker compose up -d api"
