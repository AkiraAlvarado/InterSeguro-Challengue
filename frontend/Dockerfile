FROM cgr.dev/chainguard/node:latest
WORKDIR /app
COPY --chown=65532:65532 package.json server.js ./
COPY --chown=65532:65532 public ./public
USER 65532:65532
ENV PORT=5173
EXPOSE 5173
ENTRYPOINT ["node", "server.js"]
