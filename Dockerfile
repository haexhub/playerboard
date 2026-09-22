FROM node:22-alpine AS base
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.12.3 --activate

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
# Runtime uses Alpine's own chromium package (see the runner stage), not
# Playwright's bundled download, which doesn't support musl libc.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NODE_OPTIONS="--max-old-space-size=4096"
RUN pnpm build

FROM base AS supabase-cli
WORKDIR /cli
RUN npm install --omit=dev --no-save supabase@2.117.0

FROM base AS runner
WORKDIR /app

# POST /api/veo/login (specs/003-veo-analytics) drives this headless, to
# perform a trainer-initiated Veo login — see research.md §9.
RUN apk add --no-cache chromium
ENV NUXT_VEO_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nuxt

COPY --from=builder /app/.output ./.output
COPY --from=supabase-cli /cli/node_modules ./node_modules
COPY supabase ./supabase
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

USER nuxt

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV HOME=/tmp

EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
