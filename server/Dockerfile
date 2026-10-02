# Stage 1 — build within the pnpm workspace (shared first, then server)
FROM node:22-alpine AS builder

RUN npm install -g pnpm@11.16.0

WORKDIR /app

# Workspace manifests + lockfile first (leverages Docker layer caching)
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY shared/package.json shared/package.json
COPY shared/tsconfig.json shared/tsconfig.json
COPY server/package.json server/package.json
COPY server/tsconfig.json server/tsconfig.json

RUN pnpm install --frozen-lockfile || pnpm install

# Sources
COPY shared/src/ shared/src/
COPY server/src/ server/src/

# Build shared first — server resolves @stoa/shared from its dist/ output
RUN pnpm -C shared run build && pnpm -C server run build

# Stage 2 — runtime
FROM node:22-alpine

WORKDIR /app/server

# Runtime env defaults
ENV PORT=8080
ENV STORAGE_PATH=/data/agent.sqlite
ENV VENICE_INFERENCE_KEY=""
ENV MODEL=deepseek-v4-flash-0731
ENV VENICE_BASE_URL=https://api.venice.ai/api/v1

# Built server + its workspace node_modules (pnpm symlinks + .pnpm store) +
# the @stoa/shared package it imports by name.
COPY --from=builder /app/server/dist ./dist
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/server/node_modules /app/server/node_modules
COPY --from=builder /app/shared/package.json /app/shared/package.json
COPY --from=builder /app/shared/dist /app/shared/dist

EXPOSE 8080
VOLUME /data

CMD ["node", "dist/server.js"]
