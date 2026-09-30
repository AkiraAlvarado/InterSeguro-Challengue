FROM cgr.dev/chainguard/node:latest-dev AS dependencies
USER root
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

FROM cgr.dev/chainguard/node:latest
ENV NODE_ENV=production
WORKDIR /app
COPY --from=dependencies --chown=65532:65532 /app/node_modules ./node_modules
COPY --chown=65532:65532 package.json ./package.json
COPY --chown=65532:65532 src ./src
USER 65532:65532
EXPOSE 3000
ENTRYPOINT ["node", "src/server.js"]
