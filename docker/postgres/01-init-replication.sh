#!/bin/sh
set -e

echo "=================================================================="
echo "Configuring PostgreSQL Streaming Replication user and pg_hba.conf"
echo "=================================================================="

REPLICA_USER="${REPLICATION_USER:-replicator}"
REPLICA_PASS="${REPLICATION_PASSWORD:-replica_secure_pass_123}"

# 1. Crear el usuario de replicación si no existe
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    DO \$\$
    BEGIN
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '$REPLICA_USER') THEN
            CREATE ROLE $REPLICA_USER WITH REPLICATION LOGIN ENCRYPTED PASSWORD '$REPLICA_PASS';
            RAISE NOTICE 'Replication role % created successfully', '$REPLICA_USER';
        ELSE
            ALTER ROLE $REPLICA_USER WITH REPLICATION LOGIN ENCRYPTED PASSWORD '$REPLICA_PASS';
            RAISE NOTICE 'Replication role % password updated', '$REPLICA_USER';
        END IF;
    END
    \$\$;
EOSQL

# 2. Agregar reglas en pg_hba.conf para permitir streaming replication desde la red de Docker
echo "" >> "$PGDATA/pg_hba.conf"
echo "# Reglas de Replicación Física en Streaming (Docker Internal Network)" >> "$PGDATA/pg_hba.conf"
echo "host replication $REPLICA_USER all scram-sha-256" >> "$PGDATA/pg_hba.conf"
echo "host replication $REPLICA_USER all md5" >> "$PGDATA/pg_hba.conf"
echo "host replication $REPLICA_USER all trust" >> "$PGDATA/pg_hba.conf"

echo "Streaming Replication rules added to pg_hba.conf successfully."
