FROM node:22-bookworm-slim AS builder

WORKDIR /app

ENV HUSKY=0

COPY package.json package-lock.json ./
COPY scripts ./scripts
RUN npm pkg delete scripts.prepare
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runtime

ARG CLAUDE_CODE_VERSION=2.1.145

ENV NODE_ENV=production \
    HUSKY=0 \
    HOME=/data/home \
    SERVER_PORT=3001 \
    HOST=0.0.0.0 \
    WORKSPACES_ROOT=/workspace \
    DATABASE_PATH=/data/home/.cloudcli/auth.db \
    CLAUDE_CLI_PATH=/usr/local/bin/claude

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        bash \
        ca-certificates \
        g++ \
        git \
        make \
        openssh-client \
        python3 \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY scripts ./scripts
RUN npm pkg delete scripts.prepare
RUN npm ci --omit=dev \
    && npm install -g @anthropic-ai/claude-code@${CLAUDE_CODE_VERSION} \
    && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/dist-server ./dist-server
COPY --from=builder /app/public ./public

RUN mkdir -p /data/home /workspace

EXPOSE 3001

CMD ["npm", "run", "server"]
