FROM node:22-bookworm-slim AS build

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# These are inert build placeholders, not production Shopify credentials.
# Scope them to each RUN so they are not persisted as image ENV metadata.
# Real credentials are injected only into the production runtime container.
RUN SHOPIFY_SESSION_DATABASE_URL=file:/tmp/aca-locale-build.sqlite \
    SHOPIFY_API_KEY=build-only \
    SHOPIFY_API_SECRET=build-only \
    SHOPIFY_APP_URL=https://build.invalid \
    SHOPIFY_APP_DISTRIBUTION=app_store \
    npx prisma generate
RUN SHOPIFY_SESSION_DATABASE_URL=file:/tmp/aca-locale-build.sqlite \
    SHOPIFY_API_KEY=build-only \
    SHOPIFY_API_SECRET=build-only \
    SHOPIFY_APP_URL=https://build.invalid \
    SHOPIFY_APP_DISTRIBUTION=app_store \
    npm run build

FROM node:22-bookworm-slim AS runtime

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY package.json package-lock.json ./
RUN npm ci --omit=dev \
  && npm cache clean --force

COPY --from=build /app/build ./build
COPY --from=build /app/public ./public
COPY --from=build /app/prisma ./prisma

EXPOSE 3000

CMD ["sh", "-c", "npm run setup && npm run start"]
