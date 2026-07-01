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
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/build /usr/share/nginx/html
EXPOSE 8080

HEALTHCHECK --interval=20s --timeout=5s --start-period=10s --retries=5 \
  CMD wget -q -O - "http://127.0.0.1:${PORT:-8080}/health" >/dev/null || exit 1

CMD ["/bin/sh", "-c", "envsubst '$PORT' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]
