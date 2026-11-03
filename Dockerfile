# One container: the site, the API and the MCP server. The demo company is loaded when it starts.
#   docker build -t autofte . && docker run -p 7860:7860 -e BASETEN_API_KEY=... autofte
FROM node:22-slim
# fonts for the documents the server draws (auction sheets, demo slips and certificates)
RUN apt-get update && apt-get install -y --no-install-recommends fonts-dejavu-core fonts-liberation && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build -w apps/web
RUN mkdir -p /app/.data && chown -R node:node /app/.data

ENV NODE_ENV=production
ENV PORT=7860
USER node
EXPOSE 7860
CMD ["sh", "-c", "npm run setup && npm start"]
