FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS production
WORKDIR /app

# Instalar Java 17 para el firmador XAdES
RUN apk add --no-cache openjdk17-jre

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Copiar el JAR del firmador
COPY ../signer/target/signer-1.0.0-jar-with-dependencies.jar ./signer/signer.jar

EXPOSE 3000
CMD ["node", "dist/main"]
