# Minimal Node 20 image for the chat-listener worker. The worker runs
# a single long-lived process; no HTTP surface, no build step.
FROM node:20-alpine

WORKDIR /app

# Copy manifest first for cached deps.
COPY package.json ./
RUN npm install --omit=dev

COPY index.mjs ./

# DO App Platform health-checks workers via process liveness alone, no
# port to expose. The worker is intentionally crash-on-fatal so the
# orchestrator restarts it; flush-on-SIGTERM gives 5s to drain.
CMD ["node", "index.mjs"]
