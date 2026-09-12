#!/bin/sh
set -e

echo "=================================================================="
echo "Starting PostgreSQL Read Replica Entrypoint & Streaming Sync"
echo "=================================================================="

PRIMARY_HOST="${PRIMARY_HOST:-postgres-db}"
PRIMARY_PORT="${PRIMARY_PORT:-5432}"
REPL_USER="${REPLICATION_USER:-replicator}"
REPL_PASS="${REPLICATION_PASSWORD:-replica_secure_pass_123}"
DATA_DIR="${PGDATA:-/var/lib/postgresql/data}"

echo "Waiting for primary database at $PRIMARY_HOST:$PRIMARY_PORT to become ready..."
until pg_isready -h "$PRIMARY_HOST" -p "$PRIMARY_PORT" -U "${POSTGRES_USER:-postgres}"; do
  echo "Primary database not ready yet. Retrying in 2 seconds..."
  sleep 2
done

echo "Primary database is online and reachable!"

# Si el directorio de datos no tiene PG_VERSION, clonamos el primario con pg_basebackup
if [ ! -s "$DATA_DIR/PG_VERSION" ]; then
  echo "Standby PGDATA is empty or uninitialized."
  echo "Performing pg_basebackup from $PRIMARY_HOST with streaming replication (-R)..."

  # Limpiar cualquier contenido residual
  rm -rf "${DATA_DIR:?}"/*

  export PGPASSWORD="$REPL_PASS"
  pg_basebackup \
    -h "$PRIMARY_HOST" \
    -p "$PRIMARY_PORT" \
    -D "$DATA_DIR" \
    -U "$REPL_USER" \
    -v \
    -P \
    -R \
    -X stream

  unset PGPASSWORD

  chmod 0700 "$DATA_DIR"
  if [ "$(id -u)" = "0" ]; then
    chown -R postgres:postgres "$DATA_DIR"
  fi

  echo "pg_basebackup completed successfully. standby.signal and primary_conninfo configured."
else
  echo "Existing PGDATA cluster found at $DATA_DIR. Skipping basebackup and resuming replication."
fi

echo "Starting PostgreSQL in standby read-only mode..."
exec docker-entrypoint.sh postgres
