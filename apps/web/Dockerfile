# Imagen de la web (specs/02-architecture-plan.md §1.2 y §1.4; specs/03-tasks.md T1.6).
# Contexto de build: la raíz del monorepo (hacen falta pnpm-lock.yaml y pnpm-workspace.yaml). Lo que
# entra en el contexto lo limita apps/web/Dockerfile.dockerignore.
#
# Etapas: deps (dependencias exactas del lockfile) → build (`next build`, salida standalone) → runtime
# (solo el servidor standalone y los estáticos, con el usuario sin privilegios `node`).

FROM node:22-alpine AS base
# pnpm en la versión exacta de `packageManager` (package.json), vía corepack, sin preguntas.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    NEXT_TELEMETRY_DISABLED=1
RUN corepack enable pnpm
WORKDIR /repo

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter web

FROM deps AS build
COPY apps/web apps/web
RUN pnpm --filter web run build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
WORKDIR /app
# Los archivos pertenecen a root: el proceso no puede modificar su propio código.
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
