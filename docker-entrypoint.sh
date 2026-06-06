#!/bin/sh
set -eu

CERT=/etc/ssl/certs/local-file-share.crt
KEY=/etc/ssl/private/local-file-share.key

LAN_IP=$(getent hosts host.docker.internal | awk '{ print $1 }' | head -n1)

if [ -z "$LAN_IP" ]; then
    echo "[entrypoint] WARN: could not resolve host.docker.internal — using 127.0.0.1"
    LAN_IP="127.0.0.1"
fi

if [ -f "$CERT" ] && openssl x509 -in "$CERT" -noout -ext subjectAltName 2>/dev/null | grep -q "IP Address:$LAN_IP"; then
    echo "[entrypoint] reusing existing cert for $LAN_IP"
else
    echo "[entrypoint] generating cert with LAN IP: $LAN_IP"
    openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
        -keyout "$KEY" \
        -out "$CERT" \
        -subj "/CN=$LAN_IP" \
        -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:$LAN_IP"
fi

echo "[entrypoint] cert ready — open https://$LAN_IP:3000 from other devices"

exec nginx -g 'daemon off;'
