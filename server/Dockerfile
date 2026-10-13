# FlowForge Server & Worker Process Dockerfile
FROM node:20-alpine AS base

# Install dumb-init to handle PID 1 signal forwarding properly
RUN apk add --no-cache dumb-init

WORKDIR /usr/src/app

# Install dependencies with clean caching
COPY package*.json ./
RUN npm ci --only=production

# Copy application source code
COPY . .

# Set default environment
ENV NODE_ENV=production
ENV PORT=5000

# Expose API server port
EXPOSE 5000

# Use dumb-init as entrypoint for graceful shutdown signal handling (SIGTERM / SIGINT)
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# Default command starts the API server; can be overridden in docker-compose for worker process
CMD ["node", "src/server.js"]
