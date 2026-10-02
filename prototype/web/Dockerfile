# Stage 1 — build Lit web components
FROM node:22-alpine AS builder

WORKDIR /build
# Copy shared protocol (available because compose builds from prototype/ root)
COPY shared/ /build/shared/
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/tsconfig.json /build/tsconfig.json
COPY web/src/ /build/src/
COPY web/scripts/ /build/scripts/
RUN npm run build

# Stage 2 — serve with nginx
FROM nginx:alpine

# Built SPA bundle
COPY --from=builder /build/dist/ /usr/share/nginx/html/dist/
# Static shell
COPY web/index.html /usr/share/nginx/html/index.html
# Config file
COPY web/config.js /usr/share/nginx/html/config.js
# Shared protocol module (served under /shared/)
COPY shared/ /usr/share/nginx/shared/
# Nginx config
COPY web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
