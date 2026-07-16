# Build inside Linux so deploys never depend on local dist/ artifacts.
FROM node:22-slim AS build

WORKDIR /app

RUN apt-get update -y \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY packages/engine/package.json ./packages/engine/package.json
COPY packages/backend/package.json ./packages/backend/package.json
COPY packages/backend/prisma.config.ts ./packages/backend/prisma.config.ts
COPY packages/frontend/package.json ./packages/frontend/package.json
COPY infra/package.json ./infra/package.json
COPY packages/backend/prisma ./packages/backend/prisma

# Git hooks belong on developer machines, not in deterministic image builds.
RUN npm pkg delete scripts.prepare \
    && npm ci --workspace=@ramsey/engine --workspace=@ramsey/backend --include-workspace-root

COPY tsconfig.base.json ./
COPY packages/engine/tsconfig.json ./packages/engine/tsconfig.json
COPY packages/engine/src ./packages/engine/src
COPY packages/backend/tsconfig.json ./packages/backend/tsconfig.json
COPY packages/backend/src ./packages/backend/src

RUN npm exec -w packages/backend -- prisma generate \
    --schema=/app/packages/backend/prisma/schema.prisma \
    && npm run build:engine \
    && npm run build:backend

# Keep the runtime small and rebuild native modules for the target platform.
FROM node:22-slim AS runtime

WORKDIR /app

RUN apt-get update -y \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 1001 ramsey \
    && useradd --system --uid 1001 --gid ramsey --create-home ramsey

COPY package.json package-lock.json ./
COPY packages/engine/package.json ./packages/engine/package.json
COPY packages/backend/package.json ./packages/backend/package.json
COPY packages/backend/prisma.config.ts ./packages/backend/prisma.config.ts
COPY packages/frontend/package.json ./packages/frontend/package.json
COPY infra/package.json ./infra/package.json
COPY packages/backend/prisma ./packages/backend/prisma

RUN npm pkg delete scripts.prepare \
    && npm ci --omit=dev --workspace=@ramsey/engine --workspace=@ramsey/backend --include-workspace-root \
    && npm exec -w packages/backend -- prisma generate \
      --schema=/app/packages/backend/prisma/schema.prisma \
    && npm cache clean --force

COPY --from=build /app/packages/engine/dist ./packages/engine/dist
COPY --from=build /app/packages/backend/dist ./packages/backend/dist

USER ramsey

EXPOSE 3000

# The API owns migrations; the worker overrides this command and never races it.
CMD ["sh", "-c", "node packages/backend/node_modules/prisma/build/index.js migrate deploy --schema=packages/backend/prisma/schema.prisma && exec node packages/backend/dist/index.js"]
