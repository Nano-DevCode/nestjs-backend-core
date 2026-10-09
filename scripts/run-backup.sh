#!/bin/sh
set -e

TARGET="${1:-all}"

echo "================================================================="
echo "    INICIANDO EJECUCION DE RESPALDO (DOCKER COMPOSE / HOST)     "
echo "================================================================="

backup_db() {
  echo ""
  echo "[1/2] Ejecutando respaldo de PostgreSQL..."
  if docker compose exec -T postgres-backup /backup.sh; then
    echo "✅ Respaldo de PostgreSQL completado con exito."
  else
    echo "❌ Error al ejecutar el respaldo de PostgreSQL."
    exit 1
  fi
}

backup_storage() {
  echo ""
  echo "[2/2] Ejecutando respaldo de almacenamiento (SeaweedFS)..."
  if docker compose exec -T storage-backup /usr/local/bin/backup-storage.sh; then
    echo "✅ Respaldo de almacenamiento completado con exito."
  else
    echo "❌ Error al ejecutar el respaldo de almacenamiento."
    exit 1
  fi
}

case "$TARGET" in
  db)
    backup_db
    ;;
  storage)
    backup_storage
    ;;
  all)
    backup_db
    backup_storage
    ;;
  *)
    echo "Uso: ./scripts/run-backup.sh [all|db|storage]"
    exit 1
    ;;
esac

echo ""
echo "Respaldos almacenados en:"
echo " - Base de datos:  ./backups/postgres"
echo " - Almacenamiento: ./backups/storage"
echo "================================================================="

