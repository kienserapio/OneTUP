import 'server-only'

import { ApiError } from '@/lib/api/errors'

/**
 * The provider boundary.
 *
 * Everything vendor-specific lives in this file. Business code asks the gateway
 * for a capability; the gateway asks this module for a completion. Swapping
 * OpenRouter for something else is a change here and nowhere else (ADR-006).
 *
 * Model identifiers come from configuration, never from code. Free-tier
 * availability and rate limits change often enough that hard-coding a model
 * name would guarantee an outage nobody could fix without a deploy.
 */

export type Tier = 'fast' | 'standard' | 'long' | 'reason' | 'vision'

const ENV_KEY: Record<Tier, string> = {
  fast: 'AI_TIER_FAST',
  standard: 'AI_TIER_STANDARD',
  long: 'AI_TIER_LONG',
  reason: 'AI_TIER_REASON',
  vision: 'AI_TIER_VISION',
}

export function ladderFor(tier: Tier): string[] {
  const raw = process.env[ENV_KEY[tier]] ?? ''
  return raw
    .split(',')
    .map((model) => model.trim())
    .filter(Boolean)
}

export interface CompletionRequest {
  system: string
  user: string
  /** Data URLs for capabilities that read an image. */
  images?: string[]
  maxTokens: number
  temperature?: number
  /** Ask the provider for JSON where the model supports it. */
  json?: boolean
  timeoutMs?: number
}

export interface CompletionResult {
  text: string
  model: string
  inputTokens: number | null
  outputTokens: number | null
  latencyMs: number
}

class RetryableProviderError extends Error {
  constructor(
    message: string,
    readonly kind: 'rate_limit' | 'server' | 'timeout' | 'empty',
  ) {
    super(message)
  }
}

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions'
const DEFAULT_TIMEOUT_MS = 30_000

/**
 * Tries each model in the tier in order, moving on for a rate limit, a 5xx, a
 * timeout or an empty completion. Exhausting the ladder is `AI_UNAVAILABLE` —
 * a designed state that names only the affected capability, never a stack.
 */
export async function complete(tier: Tier, request: CompletionRequest): Promise<CompletionResult> {
  const ladder = ladderFor(tier)
  if (ladder.length === 0) {
    throw new ApiError('AI_UNAVAILABLE', "That's unavailable right now. Everything else still works.")
  }

  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    throw new ApiError('AI_UNAVAILABLE', "That's unavailable right now. Everything else still works.")
  }

  let lastError: unknown = null

  for (const model of ladder) {
    try {
      return await callModel(model, request, apiKey)
    } catch (error) {
      lastError = error
      if (error instanceof RetryableProviderError) continue
      // A malformed request will fail identically on every model in the ladder.
      throw error
    }
  }

  const exhaustedOnQuota =
    lastError instanceof RetryableProviderError && lastError.kind === 'rate_limit'

  throw new ApiError(
    exhaustedOnQuota ? 'AI_QUOTA_EXCEEDED' : 'AI_UNAVAILABLE',
    exhaustedOnQuota
      ? "We've hit today's limit on that. It'll come back — everything else works."
      : "That's unavailable right now. Everything else still works.",
  )
}

async function callModel(
  model: string,
  request: CompletionRequest,
  apiKey: string,
): Promise<CompletionResult> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), request.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  const started = Date.now()

  const userContent = request.images?.length
    ? [
        { type: 'text' as const, text: request.user },
        ...request.images.map((url) => ({ type: 'image_url' as const, image_url: { url } })),
      ]
    : request.user

  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        // OpenRouter uses these for attribution on the free tier.
        'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL ?? 'https://onetup.ph',
        'X-Title': 'OneTUP',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: request.system },
          { role: 'user', content: userContent },
        ],
        max_tokens: request.maxTokens,
        temperature: request.temperature ?? 0.2,
        ...(request.json ? { response_format: { type: 'json_object' } } : {}),
      }),
      signal: controller.signal,
    })

    if (response.status === 429) {
      throw new RetryableProviderError(`rate limited on ${model}`, 'rate_limit')
    }
    if (response.status >= 500) {
      throw new RetryableProviderError(`provider ${response.status} on ${model}`, 'server')
    }
    if (!response.ok) {
      throw new ApiError('AI_UNAVAILABLE')
    }

    const body = (await response.json()) as {
      choices?: { message?: { content?: string } }[]
      usage?: { prompt_tokens?: number; completion_tokens?: number }
    }

    const text = body.choices?.[0]?.message?.content?.trim() ?? ''
    if (!text) throw new RetryableProviderError(`empty completion from ${model}`, 'empty')

    return {
      text,
      model,
      inputTokens: body.usage?.prompt_tokens ?? null,
      outputTokens: body.usage?.completion_tokens ?? null,
      latencyMs: Date.now() - started,
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new RetryableProviderError(`timeout on ${model}`, 'timeout')
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Models wrap JSON in prose or fences no matter how firmly the prompt asks them
 * not to. Recovering the object is cheaper than a repair round trip, so this is
 * tried first and the repair attempt is kept for genuine schema failures.
 */
export function extractJson(text: string): unknown {
  const trimmed = text.trim()

  try {
    return JSON.parse(trimmed)
  } catch {
    // Fall through to the recovery attempts.
  }

  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed)
  if (fenced) {
    try {
      return JSON.parse(fenced[1].trim())
    } catch {
      // Keep going.
    }
  }

  const firstBrace = trimmed.indexOf('{')
  const lastBrace = trimmed.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1))
    } catch {
      // Genuinely unusable.
    }
  }

  return null
}
