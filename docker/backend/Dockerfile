# ============================================
# Runtime image for pre-built backend
# Prerequisites: npm run build (locally) to produce dist/
# npm install is run inside the container so native addons
# (e.g. bcrypt) are compiled for Linux, not copied from Windows.
# ============================================
FROM node:22-slim

WORKDIR /app

# Install OpenSSL for Prisma engine detection
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd --system --gid 1001 ramsey && \
    useradd --system --uid 1001 --gid ramsey --create-home ramsey

# Copy package manifests (needed for npm workspaces install)
COPY package.json package-lock.json ./
COPY packages/engine/package.json ./packages/engine/package.json
COPY packages/backend/package.json ./packages/backend/package.json
# Frontend package.json needed so workspaces resolve without error
COPY packages/frontend/package.json ./packages/frontend/package.json

# Install production dependencies for Linux (recompiles native addons).
# - drop the root "prepare" script first: it runs husky (a devDependency that
#   --omit=dev doesn't install), which fails the install; git hooks have no
#   place in a runtime image anyway.
# - no output-piping or fallback: piping masked npm ci's exit code (the
#   pipeline returns tail's status), letting a broken install reach later steps.
RUN npm pkg delete scripts.prepare && npm ci --omit=dev --ignore-scripts=false

# Copy pre-built engine + backend dist
COPY packages/engine/dist ./packages/engine/dist
COPY packages/backend/dist ./packages/backend/dist
COPY packages/backend/prisma ./packages/backend/prisma

# Generate the Prisma client for this platform. npm exec -w resolves the
# prisma bin wherever npm placed it (it nests under packages/backend/
# node_modules rather than hoisting to the root).
RUN npm exec -w packages/backend -- prisma generate --schema=/app/packages/backend/prisma/schema.prisma

USER ramsey

EXPOSE 3000

CMD ["sh", "-c", "npm exec -w packages/backend -- prisma migrate deploy --schema=/app/packages/backend/prisma/schema.prisma && node packages/backend/dist/index.js"]
