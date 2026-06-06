FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY turbo.json ./
COPY packages/ ./packages/
COPY apps/api/ ./apps/api/
RUN npm install
WORKDIR /app/apps/api
RUN npm run build

# Cambiar Alpine por Debian slim
FROM node:20-slim AS production
WORKDIR /app

# Java para el firmador
RUN apt-get update && apt-get install -y \
    openjdk-17-jre-headless \
    --no-install-recommends && rm -rf /var/lib/apt/lists/*

# Chromium en Debian (mucho más estable que Alpine)
RUN apt-get update && apt-get install -y \
    chromium \
    --no-install-recommends && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/api/package.json ./package.json
COPY apps/signer/target/signer-1.0.0-jar-with-dependencies.jar ./signer/signer.jar

EXPOSE 3000
CMD ["node", "dist/main.js"]