# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
COPY package.json package-lock.json ./
RUN --mount=type=secret,id=proxy_ca,required=false \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    npm ci --omit=dev && node node_modules/playwright/cli.js install --with-deps chromium && chmod -R a+rX /ms-playwright
COPY --chown=node:node . .
USER node
ENV PORT=8080 MAX_ROOMS=2 CHROMIUM_NO_SANDBOX=1
EXPOSE 8080
CMD ["node", "server/index.js"]
