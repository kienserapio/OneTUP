# The sync worker.
#
# Built on Playwright's own image because getting Chromium's system dependencies
# right by hand is a recurring source of "works locally, fails in production".
#
# The security posture (07-AUTH-ERS.md §4.2) is partly enforced here: non-root
# user, no writable application filesystem, and no secret baked into the image.
# The container receives credentials over TLS, holds them in memory for the
# length of one scrape, and stores nothing.

FROM mcr.microsoft.com/playwright:v1.62.1-noble

ENV NODE_ENV=production \
    PORT=8787 \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

WORKDIR /app

# Dependencies first so a source change does not reinstall Chromium's world.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/worker/package.json ./apps/worker/
COPY packages/core/package.json ./packages/core/

RUN corepack enable && \
    pnpm install --filter @onetup/worker... --frozen-lockfile --prod=false

COPY packages/core ./packages/core
COPY apps/worker ./apps/worker

# Chromium needs a writable temp directory for its profile; nothing else is.
RUN mkdir -p /tmp/chromium && chown -R pwuser:pwuser /tmp/chromium /app
USER pwuser

EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

WORKDIR /app/apps/worker
CMD ["npx", "tsx", "src/server.ts"]
