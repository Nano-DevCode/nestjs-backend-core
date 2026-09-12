param (
    [ValidateSet("all", "db", "storage")]
    [string]$Target = "all"
)

$ErrorActionPreference = "Stop"

Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "    INICIANDO EJECUCION MANUAL DE RESPALDO (DOCKER COMPOSE)      " -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan

function Backup-Database {
    Write-Host ""
    Write-Host "[1/2] Ejecutando respaldo de PostgreSQL..." -ForegroundColor Yellow
    try {
        docker compose exec postgres-backup /backup.sh
        Write-Host "Respaldo de PostgreSQL completado con exito." -ForegroundColor Green
    }
    catch {
        Write-Host "Error al ejecutar el respaldo de PostgreSQL: $_" -ForegroundColor Red
    }
}

function Backup-Storage {
    Write-Host ""
    Write-Host "[2/2] Ejecutando respaldo de almacenamiento (SeaweedFS)..." -ForegroundColor Yellow
    try {
        docker compose exec storage-backup /usr/local/bin/backup-storage.sh
        Write-Host "Respaldo de almacenamiento completado con exito." -ForegroundColor Green
    }
    catch {
        Write-Host "Error al ejecutar el respaldo de almacenamiento: $_" -ForegroundColor Red
    }
}

switch ($Target) {
    "db" {
        Backup-Database
    }
    "storage" {
        Backup-Storage
    }
    "all" {
        Backup-Database
        Backup-Storage
    }
}

Write-Host ""
Write-Host "Respaldos disponibles localmente en:" -ForegroundColor Cyan
Write-Host " - Base de datos:  .\backups\postgres" -ForegroundColor White
Write-Host " - Almacenamiento: .\backups\storage" -ForegroundColor White
Write-Host "=================================================================" -ForegroundColor Cyan

