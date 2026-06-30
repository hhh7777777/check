FROM node:18-alpine
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev && apk add --no-cache ca-certificates && update-ca-certificates
COPY index.js ./
ENV NODE_ENV=production
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD wget --no-verbose --tries=1 --spider http://localhost/health || exit 1
CMD ["node", "index.js"]
