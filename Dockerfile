# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Browser-facing values are compiled into the frontend bundle.
ARG VITE_API_BASE_URL=/api
ARG VITE_API_TIMEOUT_MS=20000
ARG VITE_ALLOWED_HOSTS=localhost,127.0.0.1
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_API_TIMEOUT_MS=${VITE_API_TIMEOUT_MS}
ENV VITE_ALLOWED_HOSTS=${VITE_ALLOWED_HOSTS}

RUN DATABASE_URL="mysql://build:build@127.0.0.1:3306/build" npx prisma generate \
  && npm run build \
  && npm run build:backend

FROM build AS backend
ENV NODE_ENV=production
EXPOSE 4000
CMD ["node", "dist-server/server/src/index.js"]

FROM build AS frontend
ENV NODE_ENV=production
EXPOSE 8081
CMD ["npm", "run", "start:frontend", "--", "--host", "0.0.0.0", "--port", "8081"]
