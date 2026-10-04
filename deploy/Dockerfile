FROM node:24-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ ca-certificates && rm -rf /var/lib/apt/lists/*
COPY service/package.json service/package-lock.json service/
RUN cd service && npm ci --omit=dev && npm cache clean --force
COPY service/src service/src
COPY service/public service/public
COPY service/tsconfig.json service/
COPY service/tools service/tools
COPY eval/locked.jsonl eval/dev.jsonl eval/journeys.jsonl eval/LOCK.sha256 eval/
COPY content content
ENV NODE_ENV=production PORT=8080 DATA_DIR=/data DB_PATH=/data/app.sqlite WEB_DIR=/web
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://localhost:8080/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node_modules/.bin/tsx", "src/server.ts"]
WORKDIR /app/service
