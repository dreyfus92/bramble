FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable pnpm

FROM base AS build
COPY . /usr/src/app
WORKDIR /usr/src/app
RUN --mount=type=cache,id=/pnpm/store,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm run build

FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /prod/bramble
COPY --from=build /usr/src/app/package.json ./
COPY --from=build /usr/src/app/pnpm-lock.yaml ./
RUN --mount=type=cache,id=/pnpm/store,target=/pnpm/store pnpm install --prod --frozen-lockfile
COPY --from=build /usr/src/app/dist ./dist
EXPOSE 3000
CMD [ "node", "dist/main.js" ]
