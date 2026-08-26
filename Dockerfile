# syntax=docker/dockerfile:1.7

# Production image for Azure Container Apps. The shared CORE package is
# vendored in this repository, so cloud builds do not need a GitHub token.

FROM node:20-alpine AS builder

RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@10 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
COPY vendor/coreboys-shared ./vendor/coreboys-shared
RUN pnpm install --frozen-lockfile

COPY . .

# Next.js inlines NEXT_PUBLIC_* values during the image build. Server-only
# secrets are supplied to the container at runtime by Azure Container Apps.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SITE_URL=https://thecoreboys.com
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_BOOKING_EMAIL
ARG NEXT_PUBLIC_FACE_PRESENCE_UI_ENABLED=false
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_TWITCH_TIER_ONE_PRICE_LABEL="US $5.99"
ARG NEXT_PUBLIC_WATCH_ROOM_ICE_SERVERS

ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_BOOKING_EMAIL=$NEXT_PUBLIC_BOOKING_EMAIL
ENV NEXT_PUBLIC_FACE_PRESENCE_UI_ENABLED=$NEXT_PUBLIC_FACE_PRESENCE_UI_ENABLED
ENV NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_TWITCH_TIER_ONE_PRICE_LABEL=$NEXT_PUBLIC_TWITCH_TIER_ONE_PRICE_LABEL
ENV NEXT_PUBLIC_WATCH_ROOM_ICE_SERVERS=$NEXT_PUBLIC_WATCH_ROOM_ICE_SERVERS

RUN pnpm build

FROM node:20-alpine AS runtime

RUN apk add --no-cache curl tini && \
    addgroup -S app && adduser -S app -G app

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=builder --chown=app:app /app/.next/standalone ./
COPY --from=builder --chown=app:app /app/.next/static ./.next/static
COPY --from=builder --chown=app:app /app/public ./public

EXPOSE 3000
USER app

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${PORT}" -o /dev/null || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
