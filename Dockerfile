# Stage 1: Build
FROM node:20.18-alpine3.20 AS builder

# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk update && apk add --no-cache libc6-compat openssl

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install all dependencies (including dev for prisma generate)
RUN npm install --legacy-peer-deps

# Generate Prisma Client
RUN npx prisma generate

# Stage 2: Runtime
FROM node:20.18-alpine3.20

# Install runtime dependencies: dumb-init for signal handling, openssl and libc6-compat for Prisma, curl for healthcheck
RUN apk update && apk add --no-cache dumb-init openssl libc6-compat curl

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm install --only=production --legacy-peer-deps && npm cache clean --force

# Copy built assets and prisma client from builder
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY . .

# Expose the port the app runs on
EXPOSE 4001

# Add entrypoint script
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENTRYPOINT ["dumb-init", "--", "docker-entrypoint.sh"]
CMD ["npm", "start"]
