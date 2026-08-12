<!--
Thanks for sending this. Small and finished beats large and nearly.
Delete any section that does not apply.
-->

## What this changes

<!-- One or two sentences. What is different after this merges? -->

Closes #

## Why

<!-- The reasoning, not the diff. What was wrong, or what became possible? -->

## How to check it

<!-- The steps a reviewer follows to see it working. -->

1.
2.

## Screenshots

<!-- Anything visual: a phone width and a desktop width. Delete if not visual. -->

| Before | After |
| --- | --- |
|  |  |

## Checklist

- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes
- [ ] `pnpm lint` passes
- [ ] New calculations live in `packages/core` and have tests, including the boundary cases
- [ ] No colour, radius, shadow, font size, or duration hardcoded outside `apps/web/src/design/`
- [ ] Interactive targets are at least 44px and `prefers-reduced-motion` is respected
- [ ] No unrelated formatting churn
- [ ] No new dependency, or the description says why the platform cannot do it

## Constraint check

<!-- These override convenience. See CONTRIBUTING.md → Non-negotiable constraints. -->

- [ ] No ERS credential is persisted, logged, or cached server-side
- [ ] Every new table enables RLS **and** declares its policies in the same migration; every new view sets `security_invoker = true`
- [ ] No model produces a grade, a cut count, a fare, or a date — numbers are computed
- [ ] No query path exposes one student's attendance or grades to anyone else
- [ ] Only `NEXT_PUBLIC_*` variables reach the browser
- [ ] The paste importer still works without credentials or the worker
