/**
 * Splitting a study document into passages a model can be asked about one at a
 * time.
 *
 * The reason for chunking here is not the context window — the `long` tier
 * measures its context in hundreds of thousands of tokens and would swallow a
 * semester of notes whole. It is provenance. Every generated card carries the
 * `source_chunk_id` it came from, and that is what lets a student check a card
 * against the paragraph that produced it. A model handed the whole document
 * could not tell you which paragraph a card came from, and neither could anyone
 * afterwards.
 */

export interface Chunk {
  ordinal: number
  content: string
}

/** Big enough to hold an argument, small enough to point at. */
export const TARGET_CHUNK_CHARS = 1800

/** Below this, a chunk is a heading or a page number and has nothing to ask. */
export const MIN_CHUNK_CHARS = 120

/**
 * A hard ceiling, in case a document has no paragraph breaks at all — a PDF
 * text layer often does not. Splitting mid-sentence is ugly; sending 200KB as
 * one passage is worse.
 */
const HARD_MAX_CHARS = 6000

/**
 * Paragraph-first, because a paragraph is the unit a person would point at.
 *
 * Paragraphs are accumulated until adding the next one would overshoot the
 * target, then the accumulated text becomes a chunk. A single paragraph longer
 * than the ceiling is split on sentence boundaries, and only failing that on
 * length.
 */
export function chunkDocument(text: string, targetChars = TARGET_CHUNK_CHARS): Chunk[] {
  const normalised = text.replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').trim()
  if (!normalised) return []

  const paragraphs = normalised
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .flatMap((paragraph) => (paragraph.length > HARD_MAX_CHARS ? splitLongParagraph(paragraph) : [paragraph]))

  const chunks: string[] = []
  let current = ''

  for (const paragraph of paragraphs) {
    if (!current) {
      current = paragraph
      continue
    }
    if (current.length + paragraph.length + 2 <= targetChars) {
      current = `${current}\n\n${paragraph}`
      continue
    }
    chunks.push(current)
    current = paragraph
  }
  if (current) chunks.push(current)

  /* A trailing scrap — a footer, a page number, half a heading — is folded back
   * into the chunk before it rather than sent on its own, where it would cost a
   * model call to produce nothing. */
  if (chunks.length > 1) {
    const last = chunks[chunks.length - 1]
    if (last.length < MIN_CHUNK_CHARS) {
      chunks[chunks.length - 2] = `${chunks[chunks.length - 2]}\n\n${last}`
      chunks.pop()
    }
  }

  return chunks
    .filter((content) => content.trim().length >= MIN_CHUNK_CHARS || chunks.length === 1)
    .map((content, index) => ({ ordinal: index, content: content.trim() }))
}

/** Sentence boundaries first; a run of text with none is cut on length. */
function splitLongParagraph(paragraph: string): string[] {
  const sentences = paragraph.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g) ?? [paragraph]

  const parts: string[] = []
  let current = ''
  for (const sentence of sentences) {
    if (current.length + sentence.length <= HARD_MAX_CHARS) {
      current += sentence
      continue
    }
    if (current) parts.push(current.trim())
    current = sentence.length > HARD_MAX_CHARS ? '' : sentence

    if (sentence.length > HARD_MAX_CHARS) {
      for (let at = 0; at < sentence.length; at += HARD_MAX_CHARS) {
        parts.push(sentence.slice(at, at + HARD_MAX_CHARS).trim())
      }
    }
  }
  if (current.trim()) parts.push(current.trim())

  return parts.filter(Boolean)
}
