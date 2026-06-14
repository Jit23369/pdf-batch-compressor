# Multi-stage build for PDF Compressor

# Stage 1: Build backend
FROM node:20-alpine AS backend-build

WORKDIR /app

# Install Ghostscript for advanced compression
RUN apk add --no-cache ghostscript

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy server files
COPY server-advanced.js ./server.js

# Stage 2: Runtime
FROM node:20-alpine

WORKDIR /app

# Install Ghostscript runtime
RUN apk add --no-cache ghostscript

# Copy from build stage
COPY --from=backend-build /app/node_modules ./node_modules
COPY --from=backend-build /app/server.js ./server.js
COPY --from=backend-build /app/package*.json ./

# Create necessary directories
RUN mkdir -p uploads output

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Set environment variables
ENV NODE_ENV=production \
    PORT=3000

# Run server
CMD ["npm", "start"]
