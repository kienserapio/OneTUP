import type { NextConfig } from 'next'

const config: NextConfig = {
  reactStrictMode: true,
  // @onetup/core ships TypeScript source rather than a build step, so a change
  // to the parser or the GWA maths is picked up by dev without a rebuild.
  transpilePackages: ['@onetup/core'],
  typedRoutes: true,
  experimental: {
    // Tabler ships ~6000 icons behind one barrel file. Without this, importing
    // three of them pulls the whole index into the dev graph.
    optimizePackageImports: ['@tabler/icons-react'],
  },
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
