FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    chromium \
    ffmpeg \
    fonts-dejavu-core \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
ENV CHROME_PATH=/usr/bin/chromium
ENV REMOTION_RENDERER_PORT=8081

EXPOSE 8081

CMD ["node", "infra/remotion-renderer/server.mjs"]
