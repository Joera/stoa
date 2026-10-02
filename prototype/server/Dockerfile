FROM node:22-alpine

# Mirror the local layout: workdir is server/, shared is ../shared/
WORKDIR /app/server

# Copy package manifests
COPY server/package.json server/package-lock.json* ./

# Copy shared protocol (imported as ../../shared/protocol.js)
COPY shared/ ../shared/

RUN npm ci --ignore-scripts && npm cache clean --force

# Copy source and build
COPY server/tsconfig.json ./
COPY server/src/ ./src/
RUN npm run build

# Runtime env defaults
ENV PORT=8080
ENV STORAGE_PATH=/data/agent.sqlite
ENV PROVIDER_KEY=""

EXPOSE 8080
VOLUME /data

CMD ["node", "dist/server.js"]
