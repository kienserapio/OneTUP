/**
 * A no-op stand-in for the `server-only` package.
 *
 * That package exists to make a build fail when server code is pulled into a
 * client bundle. Under vitest there is no bundle and no client, and its real
 * entry point throws on import — so the modules worth testing (the rate
 * limiter, the error envelope) would be untestable for a reason that does not
 * apply here. Aliased in `vitest.config.ts`, for the integration project only.
 */
export {}
