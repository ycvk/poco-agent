# syntax=docker.io/docker/dockerfile:1

FROM node:20-alpine AS base

FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN corepack enable pnpm && pnpm i --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY frontend ./

ARG NEXT_PUBLIC_SESSION_POLLING_INTERVAL
ARG NEXT_PUBLIC_MESSAGE_POLLING_INTERVAL
ARG NEXT_PUBLIC_WS_URL

ENV NEXT_PUBLIC_SESSION_POLLING_INTERVAL=${NEXT_PUBLIC_SESSION_POLLING_INTERVAL}
ENV NEXT_PUBLIC_MESSAGE_POLLING_INTERVAL=${NEXT_PUBLIC_MESSAGE_POLLING_INTERVAL}
ENV NEXT_PUBLIC_WS_URL=${NEXT_PUBLIC_WS_URL}

ENV NEXT_TELEMETRY_DISABLED=1

RUN corepack enable pnpm && pnpm run build

FROM base AS runner
WORKDIR /app

ARG NEXT_PUBLIC_SESSION_POLLING_INTERVAL
ARG NEXT_PUBLIC_MESSAGE_POLLING_INTERVAL
ARG NEXT_PUBLIC_WS_URL

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

ENV NEXT_PUBLIC_SESSION_POLLING_INTERVAL=${NEXT_PUBLIC_SESSION_POLLING_INTERVAL}
ENV NEXT_PUBLIC_MESSAGE_POLLING_INTERVAL=${NEXT_PUBLIC_MESSAGE_POLLING_INTERVAL}
ENV NEXT_PUBLIC_WS_URL=${NEXT_PUBLIC_WS_URL}

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000

ENV HOSTNAME="0.0.0.0"
CMD ["node", "server.js"]
