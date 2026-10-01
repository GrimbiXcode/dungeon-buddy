# ---- Build: Frontend (Svelte/Vite) und Backend (TypeScript) ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci
COPY . .
RUN npm run build

# ---- Runtime ----
FROM node:22-alpine
LABEL org.opencontainers.image.title="Dungeon Buddy" \
      org.opencontainers.image.description="Selbst gehostete D&D-5e-Toolbox (2014 & 2024)"
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    STATIC_DIR=/app/web/dist
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
# Nur Laufzeit-Abhängigkeiten des Servers; keine Install-Skripte als root
RUN npm ci --omit=dev --workspace server --include-workspace-root=false --ignore-scripts \
    && npm cache clean --force
COPY --from=build /app/server/dist server/dist
COPY server/migrations server/migrations
COPY server/data server/data
COPY --from=build /app/web/dist web/dist
USER node
WORKDIR /app/server
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/health" >/dev/null || exit 1
CMD ["node", "dist/index.js"]
