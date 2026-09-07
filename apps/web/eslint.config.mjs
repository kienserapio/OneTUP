import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTypescript from 'eslint-config-next/typescript'

/**
 * Flat config, because `next lint` was removed in Next 16 and the script that
 * called it had been failing with "Invalid project directory provided" ever
 * since the upgrade — which is to say the app had not been linted for a while.
 *
 * `core-web-vitals` promotes the rules that affect real loading behaviour from
 * warnings to errors. On a product whose whole premise is a mid-range phone on
 * campus wifi, those are not stylistic opinions.
 */
export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts', 'public/**']),
  {
    /* Server Components run once per request, not per render, so reading the
     * clock in one is neither impure nor a re-render hazard. The React Compiler
     * rules cannot tell the two apart from the file alone. */
    files: ['src/app/**/layout.tsx', 'src/app/**/page.tsx'],
    rules: { 'react-hooks/purity': 'off' },
  },
  {
    /* eslint-plugin-react 7.37 crashes on ESLint 10 inside its React version
     * auto-detection (`contextOrFilename.getFilename is not a function`).
     * Stating the version skips that code path entirely, which is the fix
     * until the plugin catches up. Keep this in step with the react dependency. */
    settings: { react: { version: '19.2' } },
    rules: {
      /* The codebase uses `void promise` deliberately to mark a fire-and-forget
       * call — a sync flush, a background reload — and reads better for it. */
      '@typescript-eslint/no-floating-promises': 'off',

      /* `_sortKey` in a rest-destructure is how a column is dropped from a row
       * on the way out. The underscore is the signal; honour it. */
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' },
      ],

      /* The whole read path is: render from IndexedDB, then revalidate. That is
       * the "subscribe for updates from some external system" case this rule's
       * own message endorses (ADR-005) — but the `setState` lands after an
       * `await`, so the rule sees a synchronous cascade where there is none.
       *
       * A warning rather than `off`, because the rule is right about the shape
       * often enough to be worth reading, and right about it in any component
       * that is not reading the local store.
       */
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
])
