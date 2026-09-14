# ==============================================================================
# SCRIPT DE INICIALIZACIÓN Y AUTOMATIZACIÓN SSL/TLS EN POWERSHELL (WINDOWS)
# ==============================================================================

param (
    [string]$Domain = "localhost",
    [string]$Email = "admin@sistema.com",
    [int]$Staging = 0
)

$ErrorActionPreference = "Stop"

$CertDir = ".\docker\certbot\conf\live\default"
$WwwDir = ".\docker\certbot\www"

Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host "🔒 INICIALIZADOR DE PERÍMETRO SSL/TLS PARA NGINX & CERTBOT (WINDOWS)" -ForegroundColor Cyan
Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host "📍 Dominio: $Domain"
Write-Host "📧 Correo:  $Email"
Write-Host "🧪 Staging: $Staging"
Write-Host "=================================================================="

if (-not (Test-Path $CertDir)) {
    New-Item -ItemType Directory -Force -Path $CertDir | Out-Null
}
if (-not (Test-Path $WwwDir)) {
    New-Item -ItemType Directory -Force -Path $WwwDir | Out-Null
}

$FullchainFile = Join-Path $CertDir "fullchain.pem"
$PrivkeyFile = Join-Path $CertDir "privkey.pem"

# ------------------------------------------------------------------------------
# 1. Crear certificado auto-firmado provisional si no existe ninguno
# ------------------------------------------------------------------------------
if (-not (Test-Path $FullchainFile) -or -not (Test-Path $PrivkeyFile)) {
    Write-Host "⚠️ Certificados no detectados. Generando certificado auto-firmado provisional..." -ForegroundColor Yellow
    
    # Detectar openssl en PATH o en C:\Program Files\Git\usr\bin\openssl.exe
    $openSslPath = "openssl"
    $openSslInstalled = Get-Command openssl -ErrorAction SilentlyContinue
    if (-not $openSslInstalled -and (Test-Path "C:\Program Files\Git\usr\bin\openssl.exe")) {
        $openSslPath = "C:\Program Files\Git\usr\bin\openssl.exe"
        $openSslInstalled = $true
    }

    if ($openSslInstalled) {
        & $openSslPath req -x509 -nodes -newkey rsa:2048 -days 365 `
            -keyout $PrivkeyFile `
            -out $FullchainFile `
            -subj "/CN=$Domain/O=Sistema Enterprise/C=MX"
    } else {
        # Fallback ejecutando openssl dentro de un contenedor Alpine efímero
        docker run --rm -v "${PWD}/docker/certbot/conf/live/default:/certs" alpine/openssl req -x509 -nodes -newkey rsa:2048 -days 365 `
            -keyout /certs/privkey.pem `
            -out /certs/fullchain.pem `
            -subj "/CN=$Domain/O=Sistema Enterprise/C=MX"
    }
    Write-Host "✅ Certificado auto-firmado provisional creado exitosamente." -ForegroundColor Green
} else {
    Write-Host "ℹ️ Certificados existentes detectados en $CertDir." -ForegroundColor Green
}

# ------------------------------------------------------------------------------
# 2. Levantar el servicio NGINX
# ------------------------------------------------------------------------------
Write-Host "🚀 Levantando contenedor de Nginx..." -ForegroundColor Cyan
docker compose up -d nginx

# ------------------------------------------------------------------------------
# 3. Emisión de certificado real con Let's Encrypt (Si no es localhost)
# ------------------------------------------------------------------------------
if ($Domain -ne "localhost" -and $Domain -ne "127.0.0.1") {
    Write-Host "🌐 Solicitando certificado oficial a Let's Encrypt para $Domain..." -ForegroundColor Cyan

    $stagingArgs = @()
    if ($Staging -ne 0) {
        $stagingArgs = @("--staging")
        Write-Host "🧪 Modo STAGING activado." -ForegroundColor Yellow
    }

    docker compose run --rm certbot certonly `
        --webroot `
        -w /var/www/certbot `
        -d $Domain `
        --email $Email `
        --rsa-key-size 4096 `
        --agree-tos `
        --force-renewal `
        --non-interactive `
        $stagingArgs

    $realCertDir = ".\docker\certbot\conf\live\$Domain"
    if (Test-Path $realCertDir) {
        Copy-Item -Force (Join-Path $realCertDir "fullchain.pem") $FullchainFile
        Copy-Item -Force (Join-Path $realCertDir "privkey.pem") $PrivkeyFile
    }

    Write-Host "🔄 Recargando Nginx en caliente..." -ForegroundColor Cyan
    docker compose exec nginx nginx -s reload
    Write-Host "🎉 Certificado oficial de Let's Encrypt activado exitosamente." -ForegroundColor Green
} else {
    Write-Host "ℹ️ Dominio configurado como '$Domain'. Se conserva el certificado provisional para pruebas locales." -ForegroundColor Yellow
}

Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host "✅ Inicialización perimetral SSL/TLS completada con éxito." -ForegroundColor Green
Write-Host "=================================================================="
