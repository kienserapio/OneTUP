#!/usr/bin/env node
/**
 * Diffs the model ladders in `.env.example` against OpenRouter's live model
 * list and exits non-zero on a rung that no longer exists.
 *
 * Free models are withdrawn without notice and nothing tells you. The ladder in
 * `provider.ts` turns a dead rung into a `RetryableProviderError` and falls
 * through, so nothing crashes — the ladder is simply shorter than it reads, and
 * a tier can quietly wear down to one rung before anybody looks. This converts
 * that silent degradation into a failed build.
 *
 * It needs no API key: `/api/v1/models` is public. A network failure is
 * reported and skipped rather than failed, because a build should not go red
 * because OpenRouter had a bad minute.
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const TIERS = ['AI_TIER_FAST', 'AI_TIER_STANDARD', 'AI_TIER_LONG', 'AI_TIER_REASON', 'AI_TIER_VISION']

/** Capabilities that ask for JSON send `response_format`; a rung without it
 *  answers prose fine but costs a retry on every extraction. */
const JSON_PARAM = 'response_format'

function ladders(text) {
  const out = new Map()
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    if (!TIERS.includes(key)) continue
    out.set(
      key,
      trimmed
        .slice(eq + 1)
        .split(',')
        .map((m) => m.trim())
        .filter(Boolean),
    )
  }
  return out
}

const source = process.argv[2] ?? resolve(root, '.env.example')
const tiers = ladders(readFileSync(source, 'utf8'))

if (tiers.size === 0) {
  console.error(`No AI_TIER_* ladders found in ${source}.`)
  process.exit(1)
}

let live
try {
  const response = await fetch('https://openrouter.ai/api/v1/models', {
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  live = (await response.json()).data
} catch (error) {
  console.log(`Could not reach OpenRouter (${error.message}). Skipping the model check.`)
  process.exit(0)
}

const known = new Map(live.map((m) => [m.id, m]))
let dead = 0
let thin = 0

for (const [tier, models] of tiers) {
  const missing = models.filter((m) => !known.has(m))
  const alive = models.filter((m) => known.has(m))
  const jsonCapable = alive.filter((m) => (known.get(m).supported_parameters ?? []).includes(JSON_PARAM))

  console.log(`${tier}: ${alive.length}/${models.length} alive, ${jsonCapable.length} JSON-capable`)
  for (const model of missing) {
    console.log(`  withdrawn: ${model}`)
    dead += 1
  }
  /* One rung is not a ladder. Two is the minimum that survives a single model
   * rate-limiting, which on a free tier happens most days. */
  if (alive.length < 2) {
    console.log(`  only ${alive.length} rung(s) left — add another before this tier is a single point of failure`)
    thin += 1
  }
  if (jsonCapable.length === 0) {
    console.log(`  no rung supports ${JSON_PARAM} — every JSON capability on this tier will exhaust the ladder`)
    thin += 1
  }
}

if (dead || thin) {
  console.error(`\n${dead} withdrawn model(s), ${thin} thin tier(s). Update the ladders in ${source}.`)
  process.exit(1)
}

console.log('\nEvery rung is live.')
