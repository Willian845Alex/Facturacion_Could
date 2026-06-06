FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY turbo.json ./
COPY packages/ ./packages/
COPY apps/api/ ./apps/api/
RUN npm install
WORKDIR /app/apps/api
RUN npm run build

# Usar imagen oficial de Puppeteer que ya tiene Chrome compatible
FROM ghcr.io/puppeteer/puppeteer:22 AS production
WORKDIR /app

USER root
RUN apt-get update && apt-get install -y \
    openjdk-17-jre-headless \
    --no-install-recommends && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/api/package.json ./package.json
COPY apps/signer/target/signer-1.0.0-jar-with-dependencies.jar ./signer/signer.jar

EXPOSE 3000
CMD ["node", "dist/main.js"]