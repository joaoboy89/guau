#!/usr/bin/env bash
# =============================================================================
# backup-db.sh — Backup diario de Postgres a Cloudflare R2
# =============================================================================
#
# INSTALACIÓN EN EL VPS
# ---------------------
# 1. Instalar rclone:
#      curl https://rclone.org/install.sh | sudo bash
#
# 2. Crear el remote r2 en ~/.config/rclone/rclone.conf
#    (reemplazar <...> con los valores reales — NO commitear este archivo):
#
#      [r2]
#      type = s3
#      provider = Cloudflare
#      access_key_id = <R2_ACCESS_KEY_ID>
#      secret_access_key = <R2_SECRET_ACCESS_KEY>
#      endpoint = https://<ACCOUNT_ID>.r2.cloudflarestorage.com
#      acl = private
#
#    Verificar con: rclone ls r2:guau-backups
#
# 3. Asegurarse de que POSTGRES_PASSWORD y (opcionalmente) HEALTHCHECK_URL
#    estén en el .env del VPS (mismo archivo que usa docker-compose.yml).
#    Si HEALTHCHECK_URL no está seteada, el ping de healthchecks.io se saltea.
#
# 4. Dar permisos de ejecución a este script:
#      chmod +x /home/<usuario>/guau/infra/vps/backup-db.sh
#
# 5. Agregar el cron (corre a las 4:00 AM hora del servidor):
#      crontab -e
#      0 4 * * * /home/<usuario>/guau/infra/vps/backup-db.sh >> /var/log/guau-backup.log 2>&1
#
# 6. Crear el directorio de log si no existe:
#      sudo touch /var/log/guau-backup.log
#      sudo chown <usuario>:<usuario> /var/log/guau-backup.log
#
# =============================================================================

set -euo pipefail

# ─── Configuración ────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/.env"
BACKUP_DIR="/var/backups/guau"
R2_REMOTE="r2"
R2_BUCKET="guau-backups"
LOCAL_RETENTION_DAYS=2
R2_RETENTION_DAYS=30
CONTAINER="guau_postgres"
DB_USER="guau"
DB_NAME="guau"

# ─── Logging ──────────────────────────────────────────────────────────────────

log() { echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*"; }

# Ping de fallo a healthchecks.io — sin esto, si el script se corta a mitad
# de camino, healthchecks recién se entera cuando vence el grace de 1 hora.
# Con esto la alerta llega al instante. Mismo "|| true" que el ping de éxito
# de más abajo: si healthchecks.io está caído, eso no puede voltear el backup.
on_error() {
  local line="$1"
  log "ERROR: script fallido en línea ${line} — revisar arriba para detalle"
  if [ -n "${HEALTHCHECK_URL:-}" ]; then
    curl -fsS --retry 3 --max-time 10 "${HEALTHCHECK_URL}/fail" > /dev/null || true
  fi
}
trap 'on_error "$LINENO"' ERR

log "=== Backup iniciado ==="

# ─── Cargar variables de entorno ──────────────────────────────────────────────

if [ -f "${ENV_FILE}" ]; then
  set -a
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +a
  log "Cargado ${ENV_FILE}"
else
  log "ADVERTENCIA: ${ENV_FILE} no encontrado — POSTGRES_PASSWORD debe estar exportada"
fi

: "${POSTGRES_PASSWORD:?'Variable POSTGRES_PASSWORD no seteada'}"

# ─── Nombre del archivo ───────────────────────────────────────────────────────

TIMESTAMP="$(date +'%Y-%m-%d-%H%M')"
DUMP_FILE="guau-${TIMESTAMP}.dump"
DUMP_PATH="${BACKUP_DIR}/${DUMP_FILE}"

mkdir -p "${BACKUP_DIR}"

# ─── pg_dump ──────────────────────────────────────────────────────────────────

log "Dumpeando base de datos '${DB_NAME}' desde contenedor '${CONTAINER}'..."

docker exec \
  -e PGPASSWORD="${POSTGRES_PASSWORD}" \
  "${CONTAINER}" \
  pg_dump -U "${DB_USER}" -d "${DB_NAME}" -Fc \
  > "${DUMP_PATH}"

DUMP_SIZE="$(du -sh "${DUMP_PATH}" | cut -f1)"
log "Dump completado: ${DUMP_FILE} (${DUMP_SIZE})"

# ─── Verificar que el dump sirva (antes de subir y antes de pingear) ─────────
#
# Hoy nadie verifica que el dump sirva: un dump de 0 bytes se subiria a R2 y
# pingearia éxito igual — recién te enterás el día que necesitás restaurar.
# Dos chequeos baratos: tamaño mínimo (un dump real de esta base pesa mucho
# más que 1000 bytes) y la firma "PGDMP", que es lo que identifica a un dump
# en formato custom de Postgres (el "-Fc" del pg_dump de arriba). Si
# cualquiera de los dos falla, el trap ERR se encarga del ping de fallo.

MIN_DUMP_BYTES=1000

DUMP_BYTES="$(wc -c < "${DUMP_PATH}")"
if [ "${DUMP_BYTES}" -lt "${MIN_DUMP_BYTES}" ]; then
  log "ERROR: el dump pesa ${DUMP_BYTES} bytes (mínimo esperado: ${MIN_DUMP_BYTES}). pg_dump probablemente falló en silencio o escribió un archivo vacío/truncado — no se sube a R2 ni se pinguea éxito."
  exit 1
fi

DUMP_SIGNATURE="$(head -c 5 "${DUMP_PATH}")"
if [ "${DUMP_SIGNATURE}" != "PGDMP" ]; then
  log "ERROR: el dump no empieza con la firma PGDMP (formato custom de Postgres, -Fc). El archivo no es un dump válido o está corrupto — no se sube a R2 ni se pinguea éxito."
  exit 1
fi

log "Verificación del dump OK: ${DUMP_BYTES} bytes, firma PGDMP presente."

# ─── Subir a R2 ───────────────────────────────────────────────────────────────

log "Subiendo a R2 (${R2_REMOTE}:${R2_BUCKET})..."
rclone copy "${DUMP_PATH}" "${R2_REMOTE}:${R2_BUCKET}/"
log "Upload completado"

# ─── Retención local (borrar dumps de más de LOCAL_RETENTION_DAYS días) ───────

log "Limpiando dumps locales de más de ${LOCAL_RETENTION_DAYS} días..."
find "${BACKUP_DIR}" -name "guau-*.dump" -mtime "+${LOCAL_RETENTION_DAYS}" -delete || true
log "Limpieza local completada"

# ─── Retención en R2 (borrar dumps de más de R2_RETENTION_DAYS días) ──────────

log "Limpiando dumps en R2 de más de ${R2_RETENTION_DAYS} días..."
rclone delete "${R2_REMOTE}:${R2_BUCKET}" --min-age "${R2_RETENTION_DAYS}d" || true
log "Limpieza R2 completada"

# ─── Healthcheck ping (opcional) ──────────────────────────────────────────────

if [ -n "${HEALTHCHECK_URL:-}" ]; then
  log "Enviando ping a healthchecks.io..."
  curl -fsS --retry 3 --max-time 10 "${HEALTHCHECK_URL}" > /dev/null || true
fi

log "=== Backup finalizado correctamente ==="
