import { describe, expect, it } from 'vitest'
import { MIN_CHUNK_CHARS, TARGET_CHUNK_CHARS, chunkDocument } from '../src/study/chunk'

/**
 * Chunking exists for provenance, not for context windows. Every generated card
 * points at the chunk it came from, so a chunk has to be something a student
 * can actually be shown and recognise.
 */

const para = (n: number, filler = 'word') => Array(n).fill(filler).join(' ')

describe('chunkDocument', () => {
  it('has nothing to say about nothing', () => {
    expect(chunkDocument('')).toEqual([])
    expect(chunkDocument('   \n\n  \n ')).toEqual([])
  })

  it('keeps a short document as one chunk', () => {
    const chunks = chunkDocument('Quicksort has a worst case of O(n squared).')
    expect(chunks).toHaveLength(1)
    expect(chunks[0].ordinal).toBe(0)
  })

  it('numbers chunks in reading order from zero', () => {
    const doc = Array.from({ length: 6 }, () => para(200)).join('\n\n')
    const chunks = chunkDocument(doc)
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.map((c) => c.ordinal)).toEqual(chunks.map((_, i) => i))
  })

  it('packs paragraphs up to the target rather than one per chunk', () => {
    const doc = Array.from({ length: 8 }, () => para(30)).join('\n\n')
    const chunks = chunkDocument(doc)
    // Eight ~180-char paragraphs fit inside one 1800-char target.
    expect(chunks).toHaveLength(1)
  })

  it('starts a new chunk rather than overshooting the target', () => {
    const doc = Array.from({ length: 10 }, () => para(150)).join('\n\n')
    for (const chunk of chunkDocument(doc)) {
      // One oversized paragraph can exceed the target on its own; a *packed*
      // chunk must not.
      expect(chunk.content.length).toBeLessThan(TARGET_CHUNK_CHARS * 2)
    }
  })

  it('never loses text', () => {
    const doc = Array.from({ length: 12 }, (_, i) => `Paragraph ${i}. ${para(120)}`).join('\n\n')
    const rejoined = chunkDocument(doc)
      .map((c) => c.content)
      .join('\n\n')
    for (let i = 0; i < 12; i += 1) {
      expect(rejoined).toContain(`Paragraph ${i}.`)
    }
  })

  /* A PDF text layer often has no paragraph breaks at all. Sending 200KB as one
   * passage is worse than an ugly split. */
  it('splits a wall of text with no paragraph breaks', () => {
    const wall = Array.from({ length: 400 }, (_, i) => `Sentence number ${i} about something.`).join(' ')
    const chunks = chunkDocument(wall)
    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) expect(chunk.content.length).toBeLessThanOrEqual(6000)
  })

  /* A trailing footer or page number on its own would cost a model call to
   * produce nothing. */
  it('folds a trailing scrap back into the chunk before it', () => {
    const doc = `${para(400)}\n\n${para(400)}\n\nPage 7`
    const chunks = chunkDocument(doc)
    expect(chunks[chunks.length - 1].content).toContain('Page 7')
    expect(chunks[chunks.length - 1].content.length).toBeGreaterThan(MIN_CHUNK_CHARS)
  })

  it('keeps a single short document even though it is under the minimum', () => {
    const chunks = chunkDocument('Short note.')
    expect(chunks).toHaveLength(1)
    expect(chunks[0].content).toBe('Short note.')
  })

  it('normalises windows line endings', () => {
    const chunks = chunkDocument('First paragraph.\r\n\r\nSecond paragraph.')
    expect(chunks[0].content).not.toContain('\r')
  })

  it('trims each chunk', () => {
    for (const chunk of chunkDocument(`   ${para(300)}   \n\n   ${para(300)}   `)) {
      expect(chunk.content).toBe(chunk.content.trim())
    }
  })
})
