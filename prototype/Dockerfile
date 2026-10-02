FROM node:22-alpine

WORKDIR /app

# Copy package manifests and install
COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts && npm cache clean --force

# Copy source and build
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# Copy public frontend (no build step needed)
COPY public/ ./public/

# Runtime env defaults
ENV PORT=8080
ENV STORAGE_PATH=/data/agent.sqlite
ENV PROVIDER_KEY=""

EXPOSE 8080
VOLUME /data

CMD ["node", "dist/server.js"]
