# Stage 1: Builder — install all deps, compile TypeScript, then produce production node_modules
FROM node:20-slim AS builder

WORKDIR /app

# Install build tools for native modules (better-sqlite3 requires python3 + g++ + make)
RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 g++ build-essential && \
    rm -rf /var/lib/apt/lists/*

# Copy dependency manifests first (layer cache optimization)
COPY package.json package-lock.json ./

# Step 1: Full install (includes devDependencies like typescript/tsc)
# Remove husky prepare script to avoid failures when devDeps are absent on later install.
# This modifies the in-container package.json only — source file is unchanged.
RUN npm pkg delete scripts.prepare && npm ci

# Copy TypeScript config and source
COPY tsconfig.json ./
COPY src ./src

# Step 2: Compile TypeScript → dist/
RUN npm run build

# Step 3: Reinstall production-only deps so node_modules is clean for runner stage
# Native modules (better-sqlite3) are recompiled here against the same libc as runner.
RUN npm ci --omit=dev


# Stage 2: Runner — minimal runtime image
FROM node:20-slim AS runner

WORKDIR /app

# Create persistent data directories (bind mounts will overlay these at runtime,
# but they ensure paths exist if no volume is mounted)
RUN mkdir -p /app/store /app/data/sessions /app/groups/main

# Copy compiled artifacts and production node_modules from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./

# Transfer ownership to non-root user before switching
RUN chown -R node:node /app

# Run as non-root for security
USER node

# Runtime environment
ENV NODE_ENV=production

# No EXPOSE — service does not listen on any TCP port
# No HEALTHCHECK — WhatsApp connection state is not easily HTTP-detectable

CMD ["node", "dist/index.js"]
