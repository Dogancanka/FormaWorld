# FormaWorld — self-hosted image.
#
# Saved reader state is written to /data, which must be a mounted volume: the
# container filesystem is thrown away on every redeploy and the XP, digest
# acknowledgements and visit snapshots inside it would go with it.

FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# The build never contacts APS, so no credentials are needed here. A session
# secret is required only because the module reads it at request time; the real
# one comes from the environment at run time.
RUN npm run build

FROM node:24-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV FORMAWORLD_DATA_DIR=/data

RUN addgroup -g 1001 -S nodejs \
  && adduser -S formaworld -u 1001 \
  && mkdir -p /data \
  && chown -R formaworld:nodejs /data

COPY --from=build --chown=formaworld:nodejs /app/.next/standalone ./
COPY --from=build --chown=formaworld:nodejs /app/.next/static ./.next/static

USER formaworld
EXPOSE 3000
VOLUME ["/data"]
CMD ["node", "server.js"]
