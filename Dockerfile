# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=20-alpine

# ---- Builder stage ----
FROM node:${NODE_VERSION} AS builder
WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/server/package.json ./packages/server/
COPY packages/client/package.json ./packages/client/

# Install dependencies
RUN npm ci --no-audit --no-fund

# Copy source files
COPY tsconfig.base.json tsconfig.json ./
COPY biome.json ./
COPY packages ./packages

# Build all packages
RUN npm run build

# ---- Runtime stage ----
FROM node:${NODE_VERSION} AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# Copy package files for workspace resolution
COPY package.json package-lock.json* ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/server/package.json ./packages/server/
COPY packages/client/package.json ./packages/client/

# Install production dependencies
RUN npm install --no-audit --no-fund

# Copy built artifacts from builder
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/server/dist ./packages/server/dist
COPY --from=builder /app/packages/client/dist ./client-dist

# Verify the server dist exists
RUN ls -la packages/server/dist/index.js

EXPOSE 3000
CMD ["node", "packages/server/dist/index.js"]
