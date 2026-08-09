/**
 * Near-duplicate detection for announcements.
 *
 * The same quiz announcement gets shared into OneTUP by fifteen classmates,
 * each with a different quoted reply chain wrapped around it. SimHash gives a
 * 64-bit fingerprint where small edits move few bits, so those fifteen
 * submissions collapse into one record with a confirmation count — which is
 * also the main lever keeping AI calls inside the free tier.
 */

/** Strips the chat furniture that differs between copies of the same message. */
export function normaliseAnnouncement(text: string): string {
  return (
    text
      .replace(/ /g, ' ')
      // Quoted reply chains, however the client marks them.
      .replace(/^\s*>.*$/gm, '')
      // "Juan Dela Cruz: " and "[11:42 PM] Juan:" style prefixes.
      .replace(/^\s*\[?\d{1,2}:\d{2}\s*(?:[AP]\.?M\.?)?\]?\s*/gim, '')
      .replace(/^\s*[A-Z][\w.'-]*(?:\s+[A-Z][\w.'-]*){0,3}\s*:\s*/gm, '')
      // Reaction and receipt noise.
      .replace(/\b(?:seen by|reacted|liked|loved|sent|forwarded|replied to)\b.*$/gim, '')
      .replace(/https?:\/\/\S+/g, ' ')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim()
  )
}

/** FNV-1a, widened to 64 bits with BigInt. Fast and good enough for shingles. */
function hash64(token: string): bigint {
  const PRIME = 0x100000001b3n
  const MASK = 0xffffffffffffffffn
  let hash = 0xcbf29ce484222325n
  for (let i = 0; i < token.length; i++) {
    hash ^= BigInt(token.charCodeAt(i))
    hash = (hash * PRIME) & MASK
  }
  return hash
}

/** Word trigrams. Shingling is what makes reordered sentences still match. */
function shingles(text: string, size = 3): string[] {
  const words = text.split(' ').filter(Boolean)
  if (words.length <= size) return words.length ? [words.join(' ')] : []
  const out: string[] = []
  for (let i = 0; i + size <= words.length; i++) {
    out.push(words.slice(i, i + size).join(' '))
  }
  return out
}

/** 64-bit SimHash of already-normalised text, as a 16-character hex string. */
export function simhash(text: string): string {
  const features = shingles(text)
  if (features.length === 0) return '0'.repeat(16)

  const weights = new Array<number>(64).fill(0)
  for (const feature of features) {
    const h = hash64(feature)
    for (let bit = 0; bit < 64; bit++) {
      weights[bit] += (h >> BigInt(bit)) & 1n ? 1 : -1
    }
  }

  let fingerprint = 0n
  for (let bit = 0; bit < 64; bit++) {
    if (weights[bit] > 0) fingerprint |= 1n << BigInt(bit)
  }
  return fingerprint.toString(16).padStart(16, '0')
}

export function contentHash(rawText: string): string {
  return simhash(normaliseAnnouncement(rawText))
}

export function hammingDistance(a: string, b: string): number {
  let x = BigInt(`0x${a}`) ^ BigInt(`0x${b}`)
  let count = 0
  while (x) {
    x &= x - 1n
    count++
  }
  return count
}

/**
 * Two submissions are the same announcement when their fingerprints differ by
 * at most three bits. Below that, ordinary rephrasing separates them; above it,
 * genuinely different announcements start merging — which is worse, because a
 * merged announcement hides one a student needed to see.
 */
export const DUPLICATE_DISTANCE = 3

export function isDuplicate(a: string, b: string, threshold = DUPLICATE_DISTANCE): boolean {
  return hammingDistance(a, b) <= threshold
}

export interface DuplicateCandidate {
  id: string
  contentHash: string
  createdAt: Date | string
}

/** Dedup window: the same announcement re-shared days later is a new event. */
export const DUPLICATE_WINDOW_HOURS = 48

export function findDuplicate(
  hash: string,
  candidates: readonly DuplicateCandidate[],
  now: Date = new Date(),
  windowHours = DUPLICATE_WINDOW_HOURS,
): DuplicateCandidate | null {
  let best: { candidate: DuplicateCandidate; distance: number } | null = null

  for (const candidate of candidates) {
    const age = (now.getTime() - new Date(candidate.createdAt).getTime()) / 3_600_000
    if (age > windowHours || age < 0) continue

    const distance = hammingDistance(hash, candidate.contentHash)
    if (distance > DUPLICATE_DISTANCE) continue
    if (!best || distance < best.distance) best = { candidate, distance }
  }

  return best?.candidate ?? null
}
