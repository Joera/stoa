# Stage 1 — build the Lit web components within the pnpm workspace
FROM node:22-alpine AS builder

RUN npm install -g pnpm@11.16.0

WORKDIR /build

# Workspace manifests + lockfile first (leverages Docker layer caching)
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY shared/package.json shared/package.json
COPY web/package.json web/package.json

RUN pnpm install --frozen-lockfile || pnpm install

# Sources (shared/src is bundled into app.js via the @stoa/shared esbuild alias)
COPY shared/src/ shared/src/
COPY web/src/ web/src/
COPY web/scripts/ web/scripts/
# tsconfig MUST be copied — esbuild reads experimentalDecorators/useDefineForClassFields
# from it; without it esbuild falls back to TC39 standard decorators and the bundle
# throws "Unsupported decorator location: field" at load (blank page).
COPY web/tsconfig.json web/tsconfig.json

RUN pnpm -C web run build

# Stage 2 — serve with nginx
FROM nginx:alpine

# Built SPA bundle (protocol module is bundled in — nothing served from /shared/)
COPY --from=builder /build/web/dist/ /usr/share/nginx/html/dist/
# Static shell
COPY web/index.html /usr/share/nginx/html/index.html
# Config file
COPY web/config.js /usr/share/nginx/html/config.js
# Nginx config
COPY web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
