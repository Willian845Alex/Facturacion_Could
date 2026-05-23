FROM node:20-alpine AS builder
WORKDIR /app

# Copiar todo el monorepo
COPY package*.json ./
COPY turbo.json ./
COPY packages/ ./packages/
COPY apps/api/ ./apps/api/

# Instalar desde la raíz del monorepo
RUN npm install

# Build de la API
WORKDIR /app/apps/api
RUN npm run build

FROM node:20-alpine AS production
WORKDIR /app

RUN apk add --no-cache openjdk17-jre

RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/api/package.json ./package.json

COPY apps/signer/target/signer-1.0.0-jar-with-dependencies.jar ./signer/signer.jar

EXPOSE 3000
CMD ["node", "dist/main"]
