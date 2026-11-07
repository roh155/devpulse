# ==========================================
# Stage 1: Build & Dependency Pruning
# ==========================================
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./
# Install production dependencies only
RUN npm ci --only=production

COPY . .

# ==========================================
# Stage 2: Minimal Production Image
# ==========================================
FROM node:20-alpine AS runner

WORKDIR /usr/src/app

ENV NODE_ENV=production
ENV PORT=4000

# Security: Run as non-root user
USER node

# Copy only pruned artifacts from builder stage
COPY --chown=node:node --from=builder /usr/src/app ./

# Expose Telemetry Ingestion & Stream Ports
EXPOSE 4000

# Native Container Healthcheck leveraging Day 13 Liveness Probe
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4000/events || exit 1

CMD ["node", "Day-05-SSE-Stream/sseServer.js"]