# Picket — from-zero container. `docker compose up` on any box with Docker
# yields a running console (demo by default; live when a .env supplies a key).

# ---- builder: install + build the whole monorepo --------------------------
FROM node:22-slim AS builder
WORKDIR /app
RUN corepack enable
# manifests first for layer caching
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
RUN pnpm install --frozen-lockfile
RUN pnpm build                       # @picket/client, @picket/mcp, @picket/backend
RUN pnpm --filter picket-web build   # Ember + Lit app -> apps/web/dist (base '/')

# ---- runtime: slim node + the built workspace -----------------------------
FROM node:22-slim AS runtime
WORKDIR /app
# openssh-client is needed only for PICKET_BACKEND=pfsense-ssh (live EVE feed)
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssh-client \
 && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    PICKET_PORT=8200 \
    PICKET_STATIC=/app/apps/web/dist
COPY --from=builder /app ./
EXPOSE 8200
# The backend serves the console and spawns the MCP server over stdio.
CMD ["node", "packages/backend/dist/server.js"]
