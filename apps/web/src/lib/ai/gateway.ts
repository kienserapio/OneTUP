import 'server-only'

import { createHash } from 'node:crypto'
import { ApiError } from '@/lib/api/errors'
import { log } from '@/lib/api/handler'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { CAPABILITIES, ContentAdded, GroundingViolation, type CapabilityName } from './capabilities'
import { complete, extractJson } from './provider'
import { redactDeep, type RedactionContext } from './redact'

/**
 * The AI gateway — the only path to a model in the product.
 *
 * The order of the steps is the contract (06-AI-SPEC.md §2): validate, cache,
 * redact, select, prompt, call, validate, repair once, post-validate, cache,
 * log. Business code calls `runCapability('announcement_extract', input)`. It
 * never names a model, never assembles a prompt, and never sees a raw
 * completion.
 *
 * The cache is not an optimisation. One quiz announcement shared by fifteen
 * classmates is one model call, and that is the main reason the product fits
 * inside a free tier.
 */

export interface RunOptions {
  userId: string | null
  redaction?: RedactionContext
  /** Skips the cache. Only for the evaluation suite. */
  bypassCache?: boolean
}

export interface RunResult<T> {
  output: T
  meta: {
    capability: string
    model: string
    promptVersion: string
    cacheHit: boolean
    latencyMs: number
    warnings: string[]
    /** True whenever a model produced any part of the output. */
    labelled: true
  }
}

const CACHE_TTL_DAYS = 30

export async function runCapability<K extends CapabilityName>(
  name: K,
  rawInput: unknown,
  options: RunOptions,
): Promise<RunResult<unknown>> {
  const capability = CAPABILITIES[name] as (typeof CAPABILITIES)[CapabilityName]

  const parsedInput = capability.input.safeParse(rawInput)
  if (!parsedInput.success) {
    throw new ApiError('VALIDATION_FAILED', 'That input was not in the expected shape.', {
      issues: parsedInput.error.issues,
    })
  }
  const input = parsedInput.data

  const cacheKey = buildCacheKey(capability.name, capability.version, input)

  if (!options.bypassCache) {
    const cached = await readCache(cacheKey)
    if (cached) {
      await recordRun({
        userId: options.userId,
        capability: capability.name,
        model: cached.model,
        promptVersion: capability.version,
        inputHash: cacheKey,
        cacheHit: true,
        status: 'ok',
        latencyMs: 0,
      })

      return {
        output: cached.output,
        meta: {
          capability: capability.name,
          model: cached.model,
          promptVersion: capability.version,
          cacheHit: true,
          latencyMs: 0,
          warnings: [],
          labelled: true,
        },
      }
    }
  }

  // Redaction happens after the cache key is computed, so two students sharing
  // the same announcement still hit the same entry.
  const safeInput = redactDeep(input, options.redaction ?? {})

  const wantsJson = capability.json !== false

  const request = {
    system: capability.system,
    user: capability.buildUser(safeInput as never),
    images: capability.images?.(safeInput as never),
    maxTokens: capability.maxTokens,
    temperature: capability.temperature,
    json: wantsJson,
  }

  /** A prose capability's completion is its output; there is nothing to extract. */
  const readOutput = (text: string): unknown => (wantsJson ? extractJson(text) : text.trim())

  let completion = await complete(capability.tier, request)
  let parsed = capability.output.safeParse(readOutput(completion.text))

  if (!parsed.success) {
    // One repair attempt on the same model. A second failure is a real
    // incompatibility, and falling back to manual entry beats guessing.
    completion = await complete(capability.tier, {
      ...request,
      user: `${request.user}

${
  wantsJson
    ? 'Your previous reply did not match the required JSON schema. Reply with ONLY the JSON object, no prose and no code fences.'
    : 'Your previous reply was unusable. Answer the question directly, in plain text.'
}`,
      temperature: 0,
    })
    parsed = capability.output.safeParse(readOutput(completion.text))
  }

  if (!parsed.success) {
    await recordRun({
      userId: options.userId,
      capability: capability.name,
      model: completion.model,
      promptVersion: capability.version,
      inputHash: cacheKey,
      cacheHit: false,
      status: 'invalid_output',
      latencyMs: completion.latencyMs,
      inputTokens: completion.inputTokens,
      outputTokens: completion.outputTokens,
    })
    throw new ApiError('AI_INVALID_OUTPUT')
  }

  let output = parsed.data
  let warnings: string[] = []

  if (capability.postValidate) {
    try {
      const validated = await capability.postValidate(output as never, input as never)
      output = validated.output
      warnings = validated.warnings
    } catch (error) {
      // Grounding and content-addition failures get one retry with an explicit
      // reminder, because they are usually a wandering completion rather than a
      // model that cannot follow the rule.
      if (error instanceof GroundingViolation || error instanceof ContentAdded) {
        const retry = await complete(capability.tier, {
          ...request,
          user: `${request.user}

${reminderFor(error)}`,
          temperature: 0,
        })

        const retryParsed = capability.output.safeParse(readOutput(retry.text))
        if (retryParsed.success) {
          try {
            const validated = await capability.postValidate(
              retryParsed.data as never,
              input as never,
            )
            output = validated.output
            warnings = [...validated.warnings, 'repaired']
            completion = retry
          } catch {
            await recordRefusal(options.userId, capability.name, retry.model, capability.version, cacheKey)
            throw refusalFor(capability.name)
          }
        } else {
          await recordRefusal(options.userId, capability.name, retry.model, capability.version, cacheKey)
          throw refusalFor(capability.name)
        }
      } else {
        throw error
      }
    }
  }

  await writeCache(cacheKey, capability.name, capability.version, output, completion.model)

  await recordRun({
    userId: options.userId,
    capability: capability.name,
    model: completion.model,
    promptVersion: capability.version,
    inputHash: cacheKey,
    cacheHit: false,
    status: 'ok',
    latencyMs: completion.latencyMs,
    inputTokens: completion.inputTokens,
    outputTokens: completion.outputTokens,
  })

  return {
    output,
    meta: {
      capability: capability.name,
      model: completion.model,
      promptVersion: capability.version,
      cacheHit: false,
      latencyMs: completion.latencyMs,
      warnings,
      labelled: true,
    },
  }
}

function reminderFor(error: GroundingViolation | ContentAdded): string {
  if (error instanceof GroundingViolation) {
    return `Your previous answer stated ${error.claims.slice(0, 5).join(', ')}, which does not appear in any cited passage. Answer using only what the passages say, or set sufficient to false.`
  }
  return `Your previous rewrite introduced words the student did not write: ${error.words.slice(0, 5).join(', ')}. Rewrite using only their own ideas and wording.`
}

function refusalFor(capability: string): ApiError {
  if (capability === 'evaluation_polish') {
    return new ApiError(
      'AI_INVALID_OUTPUT',
      "We couldn't rewrite that without changing what you meant, so we've left your notes as they are.",
    )
  }
  return new ApiError(
    'AI_INVALID_OUTPUT',
    "We couldn't answer that from our sources. Try asking the registrar, or check the student handbook.",
  )
}

// --- Cache ---------------------------------------------------------------

/**
 * `sha256(capability | prompt_version | canonicalised input)`.
 *
 * Canonicalisation lowercases, collapses whitespace, and sorts object keys, so
 * the same announcement pasted with different trailing spaces is one entry.
 * Bumping a prompt version invalidates that capability's cache by construction.
 */
export function buildCacheKey(capability: string, version: string, input: unknown): string {
  return createHash('sha256')
    .update(`${capability}|${version}|${canonicalise(input)}`)
    .digest('hex')
}

function canonicalise(value: unknown): string {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'string') {
    return value.toLowerCase().replace(/\s+/g, ' ').trim()
  }
  if (typeof value !== 'object') return String(value)
  if (Array.isArray(value)) return `[${value.map(canonicalise).join(',')}]`

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, entry]) => `${key}:${canonicalise(entry)}`)

  return `{${entries.join(',')}}`
}

async function readCache(
  cacheKey: string,
): Promise<{ output: unknown; model: string } | null> {
  const { data } = await supabaseAdmin()
    .from('ai_cache')
    .select('output, model, expires_at, hit_count')
    .eq('cache_key', cacheKey)
    .maybeSingle()

  if (!data) return null
  if (new Date(data.expires_at).getTime() < Date.now()) return null

  void supabaseAdmin()
    .from('ai_cache')
    .update({ hit_count: (data.hit_count ?? 0) + 1 })
    .eq('cache_key', cacheKey)

  return { output: data.output, model: data.model }
}

async function writeCache(
  cacheKey: string,
  capability: string,
  version: string,
  output: unknown,
  model: string,
): Promise<void> {
  await supabaseAdmin()
    .from('ai_cache')
    .upsert({
      cache_key: cacheKey,
      capability,
      prompt_version: version,
      output: output as never,
      model,
      expires_at: new Date(Date.now() + CACHE_TTL_DAYS * 86_400_000).toISOString(),
    })
}

// --- Logging -------------------------------------------------------------

interface RunRecord {
  userId: string | null
  capability: string
  model: string
  promptVersion: string
  inputHash: string
  cacheHit: boolean
  status: 'ok' | 'invalid_output' | 'error' | 'refused'
  latencyMs: number
  inputTokens?: number | null
  outputTokens?: number | null
  errorCode?: string
}

/** Metadata only. No prompt, no completion, no content, ever. */
async function recordRun(record: RunRecord): Promise<void> {
  const { error } = await supabaseAdmin().from('ai_runs').insert({
    user_id: record.userId,
    capability: record.capability,
    model: record.model,
    prompt_version: record.promptVersion,
    input_hash: record.inputHash,
    cache_hit: record.cacheHit,
    input_tokens: record.inputTokens ?? null,
    output_tokens: record.outputTokens ?? null,
    latency_ms: record.latencyMs,
    status: record.status,
    error_code: record.errorCode ?? null,
  })

  if (error) {
    log('warn', 'ai.run.log_failed', { capability: record.capability, code: error.code })
  }
}

async function recordRefusal(
  userId: string | null,
  capability: string,
  model: string,
  version: string,
  inputHash: string,
): Promise<void> {
  await recordRun({
    userId,
    capability,
    model,
    promptVersion: version,
    inputHash,
    cacheHit: false,
    status: 'refused',
    latencyMs: 0,
  })
}
