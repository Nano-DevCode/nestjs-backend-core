FROM alpine:3.20

# Instalar herramientas necesarias para compresión y cron
RUN apk add --no-cache \
    bash \
    tar \
    gzip \
    tzdata

WORKDIR /app

# Copiar scripts
COPY backup-storage.sh /usr/local/bin/backup-storage.sh
COPY entrypoint.sh /usr/local/bin/entrypoint.sh

RUN chmod +x /usr/local/bin/backup-storage.sh /usr/local/bin/entrypoint.sh

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]

