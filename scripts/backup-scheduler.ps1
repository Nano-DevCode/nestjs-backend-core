<#
.SYNOPSIS
    Script automatizado de respaldo con rotación y registro para Programador de Tareas (Windows).
.DESCRIPTION
    Ejecuta el respaldo de base de datos y archivos, y valida que existan los archivos comprimidos.
#>

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$BaseDir = Split-Path -Parent $ScriptDir
$LogFile = Join-Path $BaseDir "backups\backup-execution.log"

$Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
Add-Content -Path $LogFile -Value "[$Timestamp] Iniciando ejecucion programada de respaldos..." -ErrorAction SilentlyContinue

try {
    & "$ScriptDir\backup.ps1" -Target "all" *>> $LogFile
    $EndTimestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Add-Content -Path $LogFile -Value "[$EndTimestamp] Respaldos finalizados correctamente."
}
catch {
    $ErrTimestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Add-Content -Path $LogFile -Value "[$ErrTimestamp] ERROR en respaldo: $_"
}

