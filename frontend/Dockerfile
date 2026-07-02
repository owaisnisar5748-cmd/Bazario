FROM node:20-alpine AS build

WORKDIR /app
COPY package*.json ./
RUN npm install --no-audit --no-fund
COPY . .

ARG REACT_APP_API_URL=/api
ARG REACT_APP_API_TIMEOUT=10000
ENV REACT_APP_API_URL=$REACT_APP_API_URL
ENV REACT_APP_API_TIMEOUT=$REACT_APP_API_TIMEOUT
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.27-alpine
ENV PORT=8080
ENV BACKEND_URL=http://127.0.0.1:8000
ENV PUBLIC_API_URL=
RUN rm -f /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build --chown=101:101 /app/build /usr/share/nginx/html
EXPOSE 8080

HEALTHCHECK --interval=20s --timeout=5s --start-period=10s --retries=5 \
  CMD wget -q -O - "http://127.0.0.1:${PORT:-8080}/health" >/dev/null || exit 1

CMD ["sh", "-c", "API_URL=\"${PUBLIC_API_URL:-$BACKEND_URL}\"; printf 'window.__BAZARIO_CONFIG__ = { API_URL: \"%s\" };\\n' \"$API_URL\" > /usr/share/nginx/html/runtime-config.js && envsubst '$PORT $BACKEND_URL' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf && exec nginx -g 'daemon off;'"]
