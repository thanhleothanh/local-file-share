# Dockerfile for Local File Share
# Single container build and run (ADR-0033)

FROM node:20-bullseye

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies
RUN npm ci

# Copy source files
COPY . .

# Build the client application
RUN npm run build

# Remove dev dependencies for production
RUN npm prune --production

# Expose port
EXPOSE 3000

# Set environment variable for production
ENV NODE_ENV=production

# Start the server
CMD ["node", "server.js"]
