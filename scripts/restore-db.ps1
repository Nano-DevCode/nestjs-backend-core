param (
    [string]$BackupFile = ""
)

$ErrorActionPreference = "Stop"

$BackupDir = Join-Path $PSScriptRoot "..\backups\postgres"
if (-not (Test-Path $BackupDir)) {
    Write-Host "No se encontro el directorio de respaldos en: $BackupDir" -ForegroundColor Red
    exit 1
}

$Files = Get-ChildItem -Path $BackupDir -Filter "*.sql.gz" -Recurse | Sort-Object LastWriteTime -Descending

if ($Files.Count -eq 0) {
    Write-Host "No hay archivos de respaldo .sql.gz en $BackupDir" -ForegroundColor Yellow
    exit 0
}

if ([string]::IsNullOrWhiteSpace($BackupFile)) {
    Write-Host ""
    Write-Host "=================================================================" -ForegroundColor Cyan
    Write-Host "       RESPALDOS DE POSTGRESQL DISPONIBLES EN EL SISTEMA         " -ForegroundColor Cyan
    Write-Host "=================================================================" -ForegroundColor Cyan
    
    for ($i = 0; $i -lt $Files.Count; $i++) {
        $sizeMB = [math]::Round($Files[$i].Length / 1MB, 2)
        Write-Host " [$($i + 1)] $($Files[$i].Name) ($sizeMB MB - $($Files[$i].LastWriteTime))" -ForegroundColor White
    }
    
    $selection = Read-Host "Selecciona el numero de respaldo a restaurar (1-$($Files.Count)) o 'q' para salir"
    if ($selection -eq 'q' -or [string]::IsNullOrWhiteSpace($selection)) {
        Write-Host "Operacion cancelada." -ForegroundColor Gray
        exit 0
    }
    
    $index = [int]$selection - 1
    if ($index -lt 0 -or $index -ge $Files.Count) {
        Write-Host "Seleccion invalida." -ForegroundColor Red
        exit 1
    }
    
    $SelectedFile = $Files[$index]
} else {
    $SelectedFile = $Files | Where-Object { $_.Name -eq $BackupFile } | Select-Object -First 1
    if (-not $SelectedFile) {
        Write-Host "No se encontro el archivo de respaldo especificado: $BackupFile" -ForegroundColor Red
        exit 1
    }
}

Write-Host ""
Write-Host "ADVERTENCIA!" -ForegroundColor Red -BackgroundColor Black
Write-Host "Estas a punto de restaurar la base de datos con el archivo:" -ForegroundColor Yellow
Write-Host "  $($SelectedFile.FullName)" -ForegroundColor White
Write-Host "Esto sobreescribira o actualizara los datos actuales de la base de datos." -ForegroundColor Yellow

$confirm = Read-Host "Deseas continuar? (escribe 'SI' para confirmar)"
if ($confirm -ne 'SI') {
    Write-Host "Restauracion cancelada por el usuario." -ForegroundColor Gray
    exit 0
}

Write-Host ""
Write-Host "Restaurando base de datos desde el contenedor..." -ForegroundColor Cyan

try {
    Get-Content $SelectedFile.FullName -Raw | docker compose exec -T postgres-db sh -c 'gunzip | psql -U ${POSTGRES_USER:-postgres} -d ${POSTGRES_DB:-sistema_db}'
    Write-Host "Restauracion completada con exito!" -ForegroundColor Green
}
catch {
    Write-Host "Error durante la restauracion: $_" -ForegroundColor Red
    exit 1
}

