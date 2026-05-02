# syntax=docker/dockerfile:1.7
#
# DigitalOcean App Platform-friendly multi-stage build for coreboys-web.
#
# Depends on `@coreboys/shared` via `file:../coreboys-shared`. App Platform
# builds each repo independently, so we clone shared from the public
# GitHub mirror during build.
#
# Uses Next.js standalone output (set in next.config.ts) so the runtime
# stage only contains the minimal server + .next/static + public.

# ---- Stage 1: build ----
FROM node:20-alpine AS builder

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN apk add --no-cache git python3 make g++ && \
    corepack enable && corepack prepare pnpm@10 --activate

WORKDIR /workspace

ARG SHARED_REF=main
ARG SHARED_REPO=https://github.com/thecoreboys/coreboys-shared.git

# Build-time-only token for cloning the private sibling repo. Stored
# encrypted in App Platform; never embedded in the runtime image because
# this stage gets discarded.
ARG GITHUB_BUILD_TOKEN
RUN if [ -n "$GITHUB_BUILD_TOKEN" ]; then \
      git config --global url."https://oauth2:${GITHUB_BUILD_TOKEN}@github.com/".insteadOf "https://github.com/"; \
    fi

RUN git clone --depth 1 --branch ${SHARED_REF} ${SHARED_REPO} coreboys-shared && \
    cd coreboys-shared && pnpm install --frozen-lockfile && pnpm build

COPY . ./coreboys-web

WORKDIR /workspace/coreboys-web
RUN pnpm install --frozen-lockfile

# Public env vars must be present at build time (Next inlines them).
# App Platform passes build-time env into the build via build args.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY

RUN pnpm build

# ---- Stage 2: runtime ----
FROM node:20-alpine AS runtime

RUN apk add --no-cache curl tini && \
    addgroup -S app && adduser -S app -G app

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Standalone output: minimal server + only the deps Next traced as needed.
COPY --from=builder --chown=app:app /workspace/coreboys-web/.next/standalone ./
COPY --from=builder --chown=app:app /workspace/coreboys-web/.next/static ./.next/static
COPY --from=builder --chown=app:app /workspace/coreboys-web/public ./public

EXPOSE 3000
USER app

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${PORT}" -o /dev/null || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
