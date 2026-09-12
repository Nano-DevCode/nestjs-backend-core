#!/bin/bash
set -e

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="/backups"
SOURCE_DIR="/data"
KEEP_DAYS=${BACKUP_KEEP_DAYS:-7}

mkdir -p "$BACKUP_DIR"

echo "======================================================================"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Iniciando respaldo de almacenamiento (SeaweedFS)..."
echo "======================================================================"

TARGET_FILE="$BACKUP_DIR/seaweedfs_${TIMESTAMP}.tar.gz"

# Comprimir contenido de /data
tar -czf "$TARGET_FILE" -C "$SOURCE_DIR" .

FILE_SIZE=$(du -h "$TARGET_FILE" | cut -f1)
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Respaldo completado con exito: $TARGET_FILE ($FILE_SIZE)"

# Rotacion y eliminacion de respaldos con mas de KEEP_DAYS dias
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Aplicando politica de retencion: eliminando respaldos > $KEEP_DAYS dias..."
DELETED_COUNT=$(find "$BACKUP_DIR" -name "seaweedfs_*.tar.gz" -type f -mtime +$KEEP_DAYS | wc -l)
find "$BACKUP_DIR" -name "seaweedfs_*.tar.gz" -type f -mtime +$KEEP_DAYS -delete
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Limpieza finalizada ($DELETED_COUNT respaldos antiguos eliminados)."
echo "======================================================================"

