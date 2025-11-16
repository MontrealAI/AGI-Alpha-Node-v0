# syntax=docker/dockerfile:1.6
FROM node:20-slim AS base
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY spec ./spec
COPY README.md ./
COPY deploy/docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
CMD []

HEALTHCHECK --interval=45s --timeout=10s --start-period=60s --retries=5 \
  CMD ["node", "src/healthcheck.js"]
