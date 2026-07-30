# ---- Stage 1: Install dependencies & build ----
ARG BASE_IMAGE=node:22-alpine
FROM ${BASE_IMAGE} AS builder
WORKDIR /app

# 1) Copy dependency manifests first (maximizes layer caching)
COPY package.json yarn.lock ./
COPY packages/ui-lib/package.json packages/ui-lib/yarn.lock ./packages/ui-lib/

# 2) Install dependencies (cached until package.json/yarn.lock change)
RUN --mount=type=cache,target=/root/.yarn YARN_CACHE_FOLDER=/root/.yarn \
    yarn install --frozen-lockfile && \
    cd packages/ui-lib && yarn install --frozen-lockfile

# 3) Copy source code (changes here don't bust the install cache)
COPY . .

ARG NEXT_PUBLIC_ENV
ENV NEXT_PUBLIC_ENV=${NEXT_PUBLIC_ENV}

ARG NEXT_PUBLIC_FIREBASE_API_KEY
ENV NEXT_PUBLIC_FIREBASE_API_KEY=${NEXT_PUBLIC_FIREBASE_API_KEY}

ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ENV NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=${NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN}

ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID
ENV NEXT_PUBLIC_FIREBASE_PROJECT_ID=${NEXT_PUBLIC_FIREBASE_PROJECT_ID}

ARG NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
ENV NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=${NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET}

ARG NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
ENV NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=${NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID}

ARG NEXT_PUBLIC_FIREBASE_APP_ID
ENV NEXT_PUBLIC_FIREBASE_APP_ID=${NEXT_PUBLIC_FIREBASE_APP_ID}

ARG NEXT_PUBLIC_MIX_PANEL_KEY
ENV NEXT_PUBLIC_MIX_PANEL_KEY=${NEXT_PUBLIC_MIX_PANEL_KEY}

ARG NEXT_PUBLIC_CRISP_WEBSITE_ID
ENV NEXT_PUBLIC_CRISP_WEBSITE_ID=${NEXT_PUBLIC_CRISP_WEBSITE_ID}

ARG NEXT_PUBLIC_SENTRY_DSN
ENV NEXT_PUBLIC_SENTRY_DSN=${NEXT_PUBLIC_SENTRY_DSN}

# Sets Next.js basePath for feature preview deploys (e.g., /life-2000).
# Not set in normal dev/prod flows — app serves from / as usual.
ARG DEPLOY_SLOT=""
ENV DEPLOY_SLOT=${DEPLOY_SLOT}

# 4) Build
RUN yarn build

# ---- Stage 2: Production image (standalone output only) ----
FROM ${BASE_IMAGE} AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=80
ENV HOSTNAME=0.0.0.0

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 80

CMD ["node", "server.js"]
