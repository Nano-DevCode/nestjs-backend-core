#!/bin/bash
set -e

CRON_SCHEDULE="${BACKUP_CRON_STORAGE:-0 3 * * *}"

echo "======================================================================"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Iniciando Contenedor de Respaldo de Almacenamiento"
echo "  - Programacion Cron: $CRON_SCHEDULE"
echo "  - Retencion: ${BACKUP_KEEP_DAYS:-7} dias"
echo "======================================================================"

# Configurar tarea programada en crond
echo "$CRON_SCHEDULE /usr/local/bin/backup-storage.sh > /proc/1/fd/1 2>&1" > /etc/crontabs/root
chmod 0600 /etc/crontabs/root

# Ejecutar respaldo inicial al levantar si BACKUP_ON_START=true
if [ "${BACKUP_ON_START}" = "true" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] BACKUP_ON_START activo: Ejecutando respaldo inicial..."
    /usr/local/bin/backup-storage.sh
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Demonio de respaldos activo y en espera."
exec crond -f -l 2 -L /proc/1/fd/1


