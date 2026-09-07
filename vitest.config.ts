import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const require_ = createRequire(import.meta.url)
const repoRoot = fileURLToPath(new URL('.', import.meta.url))

/**
 * `@supabase/supabase-js` is installed under `apps/web`, not at the root, so a
 * test file living in `supabase/tests` cannot reach it by ordinary node
 * resolution. Resolving it through the package's own exports map keeps this
 * working if pnpm ever changes where it puts the package, and returning null
 * when it is absent keeps `vitest run` from failing at config load.
 */
function resolveSupabaseJs(): string | null {
  const searchPaths = [resolve(repoRoot, 'apps/web'), repoRoot]
  try {
    const pkgPath = require_.resolve('@supabase/supabase-js/package.json', {
      paths: searchPaths,
    })
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
    const entry: string | undefined =
      pkg.exports?.['.']?.import?.default ?? pkg.module ?? pkg.main
    if (!entry) return null
    const full = resolve(dirname(pkgPath), entry)
    return existsSync(full) ? full : null
  } catch {
    return null
  }
}

const supabaseJs = resolveSupabaseJs()

export default defineConfig({
  test: {
    projects: [
      {
        // The core package is consumed by source, not by a build artefact, so
        // the tests exercise exactly the files the app imports.
        resolve: {
          alias: { '@onetup/core': resolve(repoRoot, 'packages/core/src/index.ts') },
        },
        test: {
          name: 'unit',
          environment: 'node',
          include: ['packages/core/tests/**/*.test.ts'],
        },
      },
      {
        // The web app's own pure modules — key derivation, and anything else
        // whose failure mode is silent enough to be worth pinning down.
        resolve: {
          alias: { '@onetup/core': resolve(repoRoot, 'packages/core/src/index.ts') },
        },
        test: {
          name: 'web',
          environment: 'node',
          include: ['apps/web/tests/**/*.test.ts'],
        },
      },
      {
        resolve: {
          alias: {
            ...(supabaseJs ? { '@supabase/supabase-js': supabaseJs } : {}),
            // See the stub for why. Without it, anything importing a
            // server-only module throws at import time under vitest.
            'server-only': resolve(repoRoot, 'supabase/tests/stubs/server-only.ts'),
          },
        },
        test: {
          name: 'integration',
          environment: 'node',
          include: ['supabase/tests/**/*.test.ts'],
          // Round trips to a hosted project are slower than a unit assertion.
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
})
