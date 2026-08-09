import type { NextConfig } from 'next'

const config: NextConfig = {
  reactStrictMode: true,
  // @onetup/core ships TypeScript source rather than a build step, so a change
  // to the parser or the GWA maths is picked up by dev without a rebuild.
  transpilePackages: ['@onetup/core'],
  typedRoutes: true,
  headers: async () => [
    {
      // The service worker must be allowed to control the whole origin, and it
      // must never be served from cache — a stale worker outlives a deploy.
      source: '/sw.js',
      headers: [
        { key: 'Service-Worker-Allowed', value: '/' },
        { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
      ],
    },
  ],
}

export default config
