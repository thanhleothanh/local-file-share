# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=20-alpine

# ---- Builder stage ----
FROM node:${NODE_VERSION} AS builder
WORKDIR /app

# Install dependencies separately to leverage Docker layer caching
COPY package.json package-lock.json* ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/server/package.json ./packages/server/
COPY packages/client/package.json ./packages/client/
RUN npm ci --no-audit --no-fund

# Copy source
COPY tsconfig.base.json tsconfig.json ./
COPY biome.json ./
COPY packages/shared ./packages/shared
COPY packages/server ./packages/server
COPY packages/client ./packages/client

# Build shared → server → client
RUN npm run build:shared \
  && npm run build:server \
  && npm run build:client

# ---- Runtime stage ----
FROM node:${NODE_VERSION} AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# Copy production artifacts
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/server/package.json ./packages/server/
COPY --from=builder /app/packages/server/dist ./packages/server/dist
COPY --from=builder /app/packages/client/dist ./client-dist
COPY --from=builder /app/package.json ./package.json

# Install production-only deps
RUN npm install --omit=dev --no-audit --no-fund --workspace=@lfs/shared \
  && npm install --omit=dev --no-audit --no-fund --workspace=@lfs/server \
  && npm install --omit=dev --no-audit --no-fund --workspace=@lfs/client

EXPOSE 3000
CMD ["node", "packages/server/dist/index.js"]
