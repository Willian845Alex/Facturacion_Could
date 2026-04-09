FROM node:20-alpine AS builder
WORKDIR /app

# Copiar todo el monorepo
COPY package*.json ./
COPY turbo.json ./
COPY packages/ ./packages/
COPY apps/web/ ./apps/web/

# Instalar desde la raíz
RUN npm install

# Build del frontend
WORKDIR /app/apps/web
RUN npm run build

FROM nginx:alpine AS production
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
