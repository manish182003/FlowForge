# Multi-Stage Production Dockerfile for FlowForge Client

# Stage 1: Build the Vite production bundle
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Stage 2: Serve using high-performance Nginx Alpine
FROM nginx:alpine

# Copy custom Nginx configuration with WebSocket reverse proxy support
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy compiled SPA bundle from builder stage
COPY --from=builder /usr/src/app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

