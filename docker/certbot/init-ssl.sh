#!/usr/bin/env bash
# ==============================================================================
# SCRIPT DE INICIALIZACIÓN Y AUTOMATIZACIÓN SSL/TLS (CERTBOT & LETSENCRYPT)
# ==============================================================================

set -euo pipefail

DOMAIN="${1:-${DOMAIN:-localhost}}"
EMAIL="${2:-${EMAIL:-admin@sistema.com}}"
STAGING="${3:-${STAGING:-0}}"

CERT_DIR="./docker/certbot/conf/live/default"
WWW_DIR="./docker/certbot/www"

echo "=================================================================="
echo "🔒 INICIALIZADOR DE PERÍMETRO SSL/TLS PARA NGINX & CERTBOT"
echo "=================================================================="
echo "📍 Dominio: $DOMAIN"
echo "📧 Correo:  $EMAIL"
echo "🧪 Staging: $STAGING"
echo "=================================================================="

mkdir -p "$CERT_DIR"
mkdir -p "$WWW_DIR"

# ------------------------------------------------------------------------------
# 1. Crear certificado auto-firmado provisional si no existe ninguno
# Esto evita que Nginx falle al arrancar por primera vez antes de tener Let's Encrypt
# ------------------------------------------------------------------------------
if [ ! -f "$CERT_DIR/fullchain.pem" ] || [ ! -f "$CERT_DIR/privkey.pem" ]; then
    echo "⚠️ Certificados no detectados. Generando certificado auto-firmado provisional..."
    openssl req -x509 -nodes -newkey rsa:2048 -days 365 \
        -keyout "$CERT_DIR/privkey.pem" \
        -out "$CERT_DIR/fullchain.pem" \
        -subj "/CN=$DOMAIN/O=Sistema Enterprise/C=MX" >/dev/null 2>&1
    echo "✅ Certificado auto-firmado provisional creado exitosamente."
else
    echo "ℹ️ Certificados existentes detectados en $CERT_DIR."
fi

# ------------------------------------------------------------------------------
# 2. Levantar el servicio NGINX para responder a desafíos HTTP-01
# ------------------------------------------------------------------------------
echo "🚀 Levantando contenedor de Nginx..."
docker compose up -d nginx

# ------------------------------------------------------------------------------
# 3. Emisión de certificado real con Let's Encrypt (Si no es localhost)
# ------------------------------------------------------------------------------
if [ "$DOMAIN" != "localhost" ] && [ "$DOMAIN" != "127.0.0.1" ]; then
    echo "🌐 Solicitando certificado oficial a Let's Encrypt para $DOMAIN..."

    STAGING_FLAG=""
    if [ "$STAGING" != "0" ]; then
        STAGING_FLAG="--staging"
        echo "🧪 Modo STAGING activado para evitar límites de tasa de Let's Encrypt."
    fi

    # Ejecutar Certbot mediante desafío webroot
    docker compose run --rm certbot certonly \
        --webroot \
        -w /var/www/certbot \
        -d "$DOMAIN" \
        --email "$EMAIL" \
        --rsa-key-size 4096 \
        --agree-tos \
        --force-renewal \
        --non-interactive \
        $STAGING_FLAG

    # Copiar los certificados oficiales al directorio por defecto de Nginx
    echo "🔄 Vinculando certificados oficiales a Nginx..."
    REAL_CERT_DIR="./docker/certbot/conf/live/$DOMAIN"
    if [ -d "$REAL_CERT_DIR" ]; then
        cp -f "$REAL_CERT_DIR/fullchain.pem" "$CERT_DIR/fullchain.pem"
        cp -f "$REAL_CERT_DIR/privkey.pem" "$CERT_DIR/privkey.pem"
    fi

    echo "🔄 Recargando Nginx en caliente..."
    docker compose exec nginx nginx -s reload
    echo "🎉 Certificado oficial de Let's Encrypt activado exitosamente."
else
    echo "ℹ️ Dominio configurado como '$DOMAIN'. Se conserva el certificado provisional para pruebas locales."
fi

echo "=================================================================="
echo "✅ Inicialización perimetral SSL/TLS completada con éxito."
echo "=================================================================="

