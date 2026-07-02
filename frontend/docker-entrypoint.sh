#!/bin/sh
set -eu

backend_url="${BACKEND_URL:-${PUBLIC_API_URL:-}}"
backend_url="$(printf '%s' "$backend_url" | tr -d '\r' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//;s#/*$##')"

if [ -n "$backend_url" ] && ! printf '%s' "$backend_url" | grep -Eq '^https?://'; then
  backend_url="https://$backend_url"
fi

if [ -z "$backend_url" ]; then
  backend_url="http://127.0.0.1:8000"
fi

export BACKEND_URL="$backend_url"
echo "Bazario frontend proxy target: $BACKEND_URL"

printf 'window.__BAZARIO_CONFIG__ = { API_URL: "/api" };\n' > /usr/share/nginx/html/runtime-config.js
envsubst '$PORT $BACKEND_URL' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf
grep -n 'proxy_pass' /etc/nginx/conf.d/default.conf

exec nginx -g 'daemon off;'
