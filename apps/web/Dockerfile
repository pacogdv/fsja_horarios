# Imagen de la web (specs/02-architecture-plan.md §1.2 y §1.4; specs/03-tasks.md T1.6).
# Contexto de build: la raíz del monorepo (hacen falta pnpm-lock.yaml y pnpm-workspace.yaml). Lo que
# entra en el contexto lo limita apps/web/Dockerfile.dockerignore.
#
# Etapas:
#   deps    dependencias exactas del lockfile.
#   build   `next build`, salida standalone.
#   tools   instalación solo de producción con el CLI de Prisma, las migraciones y el seed (T1.16).
#   runtime servidor standalone, estáticos y tools, con el usuario sin privilegios `node`. Arranca con
#           docker-entrypoint.sh: migraciones → seed opcional → servidor (02 §1.4).

FROM node:22-alpine AS base
# pnpm en la versión exacta de `packageManager` (package.json), vía corepack, sin preguntas.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    NEXT_TELEMETRY_DISABLED=1
RUN corepack enable pnpm
WORKDIR /repo

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/prisma.config.ts apps/web/
# `postinstall` genera el cliente de Prisma: necesita el esquema (no la BD).
COPY apps/web/prisma apps/web/prisma
RUN pnpm install --frozen-lockfile --filter web

FROM deps AS build
COPY apps/web apps/web
RUN pnpm --filter web run build

FROM base AS tools
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/prisma.config.ts apps/web/tsconfig.json apps/web/
COPY apps/web/prisma apps/web/prisma
# El seed importa el cliente de Prisma, el hasher y env.ts de src/. `postinstall` genera el cliente dentro.
COPY apps/web/src apps/web/src
# Next.js, su compilador nativo y sharp (~320 MB) son del servidor, que ya va en la salida standalone: ni las
# migraciones ni el seed los usan. compose.test.sh comprueba que el seed no importa Next.js.
RUN pnpm install --frozen-lockfile --filter web --prod \
    && rm -rf node_modules/.pnpm/next@* node_modules/.pnpm/@next+* node_modules/.pnpm/@img+* \
       node_modules/.pnpm/sharp@* apps/web/node_modules/next

FROM node:22-alpine AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
WORKDIR /app
# Los archivos pertenecen a root: el proceso no puede modificar su propio código.
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=tools /repo /app/tools
COPY --chmod=0755 apps/web/docker-entrypoint.sh /app/docker-entrypoint.sh
USER node
EXPOSE 3000
ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["node", "apps/web/server.js"]
