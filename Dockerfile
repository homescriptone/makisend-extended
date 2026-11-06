# Local development image — not intended for production (deploys go via `pnpm deploy`).
FROM node:24-bookworm-slim

# pnpm via corepack, pinned to the same major as the host tooling.
RUN corepack enable && corepack prepare pnpm@11 --activate

WORKDIR /workspace

# 1) Dependency layer first — cached across source edits.
COPY pnpm-lock.yaml pnpm-workspace.yaml .npmrc package.json ./
COPY src/backend/package.json src/backend/
COPY src/frontend/package.json src/frontend/
RUN pnpm install --frozen-lockfile

# 2) Source. node_modules, .wrangler and secret files are excluded by .dockerignore;
#    compose bind-mounts the repo over /workspace at run time anyway.
COPY . .

WORKDIR /workspace/src/backend

CMD ["pnpm", "dev"]
