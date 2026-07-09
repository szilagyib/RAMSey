# ============================================
# Stage 1: Install dependencies
# ============================================
FROM node:20-alpine AS deps

WORKDIR /app

# Copy root workspace files
COPY package.json package-lock.json ./

# Copy workspace package.json files
COPY packages/engine/package.json ./packages/engine/package.json
COPY packages/backend/package.json ./packages/backend/package.json

# Install dependencies for engine and backend workspaces
RUN npm ci --workspace=@ramsey/engine --workspace=@ramsey/backend

# ============================================
# Stage 2: Build
# ============================================
FROM node:20-alpine AS build

WORKDIR /app

# Copy installed node_modules and package files from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/engine/node_modules ./packages/engine/node_modules
COPY --from=deps /app/packages/backend/node_modules ./packages/backend/node_modules
COPY --from=deps /app/package.json ./package.json
COPY --from=deps /app/package-lock.json ./package-lock.json
COPY --from=deps /app/packages/engine/package.json ./packages/engine/package.json
COPY --from=deps /app/packages/backend/package.json ./packages/backend/package.json

# Copy TypeScript configs
COPY tsconfig.base.json ./tsconfig.base.json
COPY packages/engine/tsconfig.json ./packages/engine/tsconfig.json
COPY packages/backend/tsconfig.json ./packages/backend/tsconfig.json

# Copy engine source and build it first (backend depends on it)
COPY packages/engine/src ./packages/engine/src
RUN npm run build -w packages/engine

# Copy backend source (including prisma schema)
COPY packages/backend/src ./packages/backend/src
COPY packages/backend/prisma ./packages/backend/prisma

# Generate Prisma client
RUN npx prisma generate --schema=packages/backend/prisma/schema.prisma

# Build backend (which includes the worker code)
RUN npm run build -w packages/backend

# ============================================
# Stage 3: Production runtime
# ============================================
FROM node:20-alpine AS runtime

WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 ramsey && \
    adduser --system --uid 1001 ramsey

# Copy built artifacts
COPY --from=build /app/packages/backend/dist ./packages/backend/dist
COPY --from=build /app/packages/engine/dist ./packages/engine/dist
COPY --from=build /app/packages/engine/package.json ./packages/engine/package.json
COPY --from=build /app/packages/backend/package.json ./packages/backend/package.json
COPY --from=build /app/package.json ./package.json

# Copy node_modules (production dependencies)
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/backend/node_modules ./packages/backend/node_modules
COPY --from=build /app/packages/engine/node_modules ./packages/engine/node_modules

# Copy Prisma schema and generated client
COPY --from=build /app/packages/backend/prisma ./packages/backend/prisma

# Switch to non-root user
USER ramsey

# The solver worker does not expose any ports — it connects to Redis as a consumer

CMD ["node", "packages/backend/dist/worker/solver-worker.js"]
