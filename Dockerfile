# syntax=docker/dockerfile:1.6
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY src ./src
COPY examples ./examples
COPY scripts ./scripts
COPY README.md START_HERE.md ./
RUN mkdir /data && chown node:node /data
USER node
VOLUME ["/data"]
ENTRYPOINT ["node", "src/alpha/cli.js", "--home", "/data"]
CMD ["autopilot", "--runtime"]
HEALTHCHECK --interval=45s --timeout=10s --start-period=60s --retries=3 \
  CMD ["node", "src/alpha/cli.js", "--home", "/data", "status"]
