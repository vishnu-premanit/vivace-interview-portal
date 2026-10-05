# Single-container build of the portal (Express + Angular build). The ML service has its own Dockerfile.
FROM node:22-alpine AS client
WORKDIR /app/client
COPY client/package*.json client/.npmrc ./
RUN npm ci
COPY client/ ./
RUN npm run build

FROM node:22-alpine
ENV NODE_ENV=production PORT=8080
WORKDIR /app
COPY server/package*.json server/
RUN npm --prefix server ci --omit=dev
COPY server/ server/
COPY --from=client /app/client/dist client/dist
USER node
EXPOSE 8080
HEALTHCHECK CMD wget -qO- http://localhost:8080/api/health || exit 1
CMD ["node", "server/src/server.js"]
