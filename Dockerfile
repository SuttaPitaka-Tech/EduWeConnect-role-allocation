FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json ./
# Assuming package-lock.json might exist, but if not we still install
COPY . .
RUN npm install
RUN npm run build

FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production

COPY package.json ./
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist

RUN addgroup -S nestjs && adduser -S nestjs -G nestjs
RUN chown -R nestjs:nestjs /app
USER nestjs

EXPOSE 7002

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:7002/health || exit 1

CMD ["node", "dist/main.js"]
