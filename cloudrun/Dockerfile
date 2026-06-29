# WeChat Cloud Run Backend Service
# Multi-stage build for smaller final image

# Stage 1: Build
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files first for better caching
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm install --omit=dev

# Stage 2: Production
FROM node:18-alpine

WORKDIR /app

# Install and refresh trusted root certificates for outbound HTTPS requests.
RUN apk add --no-cache ca-certificates \
  && update-ca-certificates

# Copy built dependencies
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./
COPY index.js ./

# Expose port 80 (Cloud Run default)
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost/health || exit 1

# Start the server
CMD ["node", "index.js"]
