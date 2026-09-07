import { z } from 'zod'
import { chunkDocument, initialCardState, manilaDate, type TablesInsert } from '@onetup/core'
import { errors } from '@/lib/api/errors'
import { authenticated, log, parseBody } from '@/lib/api/handler'
import { enforceLimit, recordAttempt } from '@/lib/api/rate-limit'
import { runCapability } from '@/lib/ai/gateway'
import { supabaseServer } from '@/lib/supabase/server'

/**
 * Flashcards from a document the student uploaded.
 *
 * This is the one part of Study that needs a route. Everything else — packs,
 * cards, reviews — is an ordinary row a student owns and goes through the
 * offline queue. This costs model calls against a daily quota, so it is metered
 * (`study_pack`, three a day, a policy written long before anything called it)
 * and it needs the gateway, which is server-only.
 *
 * **Every generated card carries the chunk it came from.** That is what turns
 * "check it against the source" from a disclaimer into an action a student can
 * take, and it is why the chunks are stored rather than discarded after
 * generation (`013_study.sql`). A card with no `source_chunk_id` was written by
 * a person; a card with one was written by a model and can be traced.
 *
 * The pack moves `processing` → `ready` or `failed`, and never sits in
 * `processing` because something threw: the failure path writes `failed`
 * before it rethrows, so a pack that has stopped says so.
 */

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * How many chunks one document may cost.
 *
 * A semester of notes is a hundred chunks and a hundred model calls, and the
 * free tier allows fifty requests a *day*. Twelve is a generous lecture and
 * still leaves the student's assistant working afterwards. The rest of the
 * document is stored, not read — regenerating from a later offset is a feature
 * somebody can add when anyone asks for it.
 */
const MAX_CHUNKS = 12

const GenerateRequest = z.object({
  title: z.string().trim().min(1).max(120),
  enrollment_id: z.uuid().nullable().optional(),
  /** The document itself. Uploaded to Storage first; this is its path. */
  source_path: z.string().max(400).optional(),
  source_name: z.string().max(200).optional(),
  /** Or the text directly, for a student who pasted their notes. */
  text: z.string().max(200_000).optional(),
})

export const POST = authenticated(async (request, { user }) => {
  const body = await parseBody(request, GenerateRequest)
  await enforceLimit(user.id, 'study_pack')

  const supabase = await supabaseServer()

  const text = body.text?.trim() || (await readSource(supabase, body.source_path))
  if (!text || text.length < 200) {
    throw errors.validation(
      'There is not enough in that to make cards from. Paste your notes, or upload a longer document.',
    )
  }

  const chunks = chunkDocument(text)
  if (chunks.length === 0) {
    throw errors.validation('There is nothing readable in that document.')
  }

  /* The subject is context for the model, never a source. It never contributes
   * a fact — it tells the model whether "resolution" means optics or a council
   * motion. */
  let subject: string | undefined
  if (body.enrollment_id) {
    const { data: enrollment } = await supabase
      .from('enrollments')
      .select('id, courses(code, title)')
      .eq('id', body.enrollment_id)
      .maybeSingle()
    if (!enrollment) throw errors.validation('That subject is not one of yours.')
    const course = enrollment.courses as unknown as { code: string; title: string } | null
    subject = course ? `${course.code} — ${course.title}` : undefined
  }

  const { data: pack, error: packError } = await supabase
    .from('study_packs')
    .insert({
      user_id: user.id,
      title: body.title,
      enrollment_id: body.enrollment_id ?? null,
      source_name: body.source_name ?? null,
      source_path: body.source_path ?? null,
      status: 'processing',
      prompt_version: '1.0.0',
    })
    .select('id')
    .single()

  if (packError) throw errors.internal({ cause: packError.message })

  try {
    const used = chunks.slice(0, MAX_CHUNKS)

    const { data: storedChunks, error: chunkError } = await supabase
      .from('study_chunks')
      .insert(
        used.map((chunk) => ({
          pack_id: pack.id,
          user_id: user.id,
          ordinal: chunk.ordinal,
          content: chunk.content,
        })),
      )
      .select('id, ordinal')

    if (chunkError) throw new Error(chunkError.message)

    const chunkIdByOrdinal = new Map((storedChunks ?? []).map((row) => [row.ordinal, row.id]))

    const today = manilaDate(new Date())
    const state = initialCardState()
    const cards: TablesInsert<'flashcards'>[] = []
    let model: string | null = null
    let failedChunks = 0

    for (const chunk of used) {
      try {
        const run = await runCapability(
          'study_pack_generate',
          { chunk: chunk.content, subject, max_cards: 5 },
          { userId: user.id },
        )
        model ??= run.meta.model
        const generated = run.output as { cards: { front: string; back: string }[] }

        for (const card of generated.cards) {
          cards.push({
            user_id: user.id,
            pack_id: pack.id,
            source_chunk_id: chunkIdByOrdinal.get(chunk.ordinal) ?? null,
            front: card.front,
            back: card.back,
            ease_factor: state.easeFactor,
            interval_days: state.intervalDays,
            repetitions: state.repetitions,
            lapses: state.lapses,
            due_on: today,
          })
        }
      } catch {
        /* One chunk that the ladder could not answer for should not lose the
         * eleven that worked. A pack with cards from most of a document is
         * useful; a failed pack is not. */
        failedChunks += 1
      }
    }

    if (cards.length === 0) {
      await supabase.from('study_packs').update({ status: 'failed' }).eq('id', pack.id)
      await recordAttempt(user.id, 'study_pack', 'failure')
      throw errors.internal({
        cause: failedChunks > 0 ? 'every chunk failed' : 'no cards produced',
      })
    }

    const { error: cardError } = await supabase.from('flashcards').insert(cards)
    if (cardError) throw new Error(cardError.message)

    await supabase
      .from('study_packs')
      .update({ status: 'ready', model_used: model })
      .eq('id', pack.id)

    await recordAttempt(user.id, 'study_pack', 'ok')

    log('info', 'study_pack.generated', {
      pack_id: pack.id,
      chunks: used.length,
      chunks_failed: failedChunks,
      cards: cards.length,
      truncated: chunks.length > MAX_CHUNKS,
    })

    return {
      pack: { id: pack.id, status: 'ready' },
      cards: cards.length,
      chunks: used.length,
      /* Said out loud rather than left for the student to notice. A pack that
       * covers the first twelve chunks of a forty-chunk document is not the
       * pack they asked for, and finding that out during revision is worse
       * than being told now. */
      chunks_skipped: Math.max(0, chunks.length - MAX_CHUNKS),
    }
  } catch (cause) {
    /* A pack that stopped must say so. Left in `processing` it is a spinner
     * that never resolves, on a screen the student will come back to. */
    await supabase.from('study_packs').update({ status: 'failed' }).eq('id', pack.id)
    if (cause && typeof cause === 'object' && 'status' in cause) throw cause
    throw errors.internal({ cause: cause instanceof Error ? cause.message : String(cause) })
  }
})

/**
 * Reads an uploaded document back out of Storage.
 *
 * Only text is read here. The bucket also accepts PDFs, because storing the
 * original is what makes a card checkable — but extracting a PDF's text layer
 * is a separate problem with its own failure modes, and pretending to have done
 * it would produce cards from binary noise.
 */
async function readSource(
  supabase: Awaited<ReturnType<typeof supabaseServer>>,
  path: string | undefined,
): Promise<string | null> {
  if (!path) return null

  const { data, error } = await supabase.storage.from('study-sources').download(path)
  if (error || !data) return null

  if (data.type === 'application/pdf') {
    throw errors.validation(
      "I can't read a PDF yet — it's saved, but paste the text you want cards from and I'll use that.",
    )
  }

  return (await data.text()).slice(0, 200_000)
}
