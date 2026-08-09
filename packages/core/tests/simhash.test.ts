import { describe, expect, it } from 'vitest'
import {
  DUPLICATE_DISTANCE,
  DUPLICATE_WINDOW_HOURS,
  contentHash,
  findDuplicate,
  hammingDistance,
  isDuplicate,
  normaliseAnnouncement,
  simhash,
} from '@onetup/core'
import type { DuplicateCandidate } from '@onetup/core'

const ANNOUNCEMENT = 'Quiz on Friday for CS 3105, covering chapters 4 to 6. Bring a calculator.'

describe('normaliseAnnouncement', () => {
  it('reduces a plain message to lowercase words', () => {
    expect(normaliseAnnouncement(ANNOUNCEMENT)).toBe(
      'quiz on friday for cs 3105 covering chapters 4 to 6 bring a calculator',
    )
  })

  it('strips quoted reply chains', () => {
    const quoted = [
      '> Juan Dela Cruz: something else entirely',
      '> a second quoted line',
      ANNOUNCEMENT,
    ].join('\n')
    expect(normaliseAnnouncement(quoted)).toBe(normaliseAnnouncement(ANNOUNCEMENT))
  })

  it('strips a sender name prefix', () => {
    expect(normaliseAnnouncement(`Maria Santos: ${ANNOUNCEMENT}`)).toBe(
      normaliseAnnouncement(ANNOUNCEMENT),
    )
    expect(normaliseAnnouncement(`Juan: ${ANNOUNCEMENT}`)).toBe(
      normaliseAnnouncement(ANNOUNCEMENT),
    )
  })

  it('strips a bracketed timestamp and the sender after it', () => {
    expect(normaliseAnnouncement(`[11:42 PM] Juan: ${ANNOUNCEMENT}`)).toBe(
      normaliseAnnouncement(ANNOUNCEMENT),
    )
    expect(normaliseAnnouncement(`11:42 Juan Dela Cruz: ${ANNOUNCEMENT}`)).toBe(
      normaliseAnnouncement(ANNOUNCEMENT),
    )
  })

  it('strips receipt and reaction noise', () => {
    expect(normaliseAnnouncement(`${ANNOUNCEMENT}\nSeen by 12 people`)).toBe(
      normaliseAnnouncement(ANNOUNCEMENT),
    )
    expect(normaliseAnnouncement(`${ANNOUNCEMENT}\nforwarded from Class GC`)).toBe(
      normaliseAnnouncement(ANNOUNCEMENT),
    )
  })

  it('strips links, which differ between shares of the same post', () => {
    expect(
      normaliseAnnouncement(`${ANNOUNCEMENT} https://facebook.com/groups/1/posts/2?ref=share`),
    ).toBe(normaliseAnnouncement(ANNOUNCEMENT))
  })

  it('collapses non-breaking spaces and runs of whitespace', () => {
    expect(normaliseAnnouncement('Quiz on   Friday')).toBe('quiz on friday')
  })

  it('produces an empty string for content with nothing but furniture', () => {
    expect(normaliseAnnouncement('')).toBe('')
    expect(normaliseAnnouncement('> only a quote')).toBe('')
    expect(normaliseAnnouncement('!!! ??? ...')).toBe('')
  })
})

describe('simhash', () => {
  it('is a 16-character hex fingerprint', () => {
    const hash = simhash(normaliseAnnouncement(ANNOUNCEMENT))
    expect(hash).toMatch(/^[0-9a-f]{16}$/)
  })

  it('is all zeroes for empty text rather than throwing', () => {
    expect(simhash('')).toBe('0'.repeat(16))
    expect(contentHash('')).toBe('0'.repeat(16))
  })

  it('is stable for the same input', () => {
    expect(simhash('quiz on friday')).toBe(simhash('quiz on friday'))
  })

  it('handles text shorter than one shingle', () => {
    expect(contentHash('quiz')).toMatch(/^[0-9a-f]{16}$/)
    expect(contentHash('quiz')).not.toBe('0'.repeat(16))
  })
})

describe('contentHash across the ways one announcement gets re-shared', () => {
  /**
   * The same quiz announcement arrives from fifteen classmates, each wrapped in
   * a different reply chain. Collapsing them into one record is what keeps the
   * AI calls inside the free tier.
   */
  it('is identical for every wrapper around the same message', () => {
    const variants = [
      ANNOUNCEMENT,
      `Maria Santos: ${ANNOUNCEMENT}`,
      `[11:42 PM] Juan: ${ANNOUNCEMENT}`,
      `> earlier chatter in the group\n${ANNOUNCEMENT}`,
      `${ANNOUNCEMENT}\nSeen by 12 people`,
      `${ANNOUNCEMENT} https://m.facebook.com/story.php?id=9`,
      ANNOUNCEMENT.replace(/ /g, ' '),
      ANNOUNCEMENT.toUpperCase(),
    ]
    const hashes = new Set(variants.map(contentHash))
    expect(hashes.size).toBe(1)
  })

  it('is far apart for a genuinely different announcement', () => {
    const other = 'Class suspended tomorrow because of the typhoon. No make-up session yet.'
    // Well past the threshold — merging these would hide one a student needed.
    expect(hammingDistance(contentHash(ANNOUNCEMENT), contentHash(other))).toBeGreaterThan(
      DUPLICATE_DISTANCE,
    )
    expect(isDuplicate(contentHash(ANNOUNCEMENT), contentHash(other))).toBe(false)
  })
})

describe('hammingDistance', () => {
  it('counts differing bits', () => {
    expect(hammingDistance('0000000000000000', '0000000000000000')).toBe(0)
    expect(hammingDistance('0000000000000000', '0000000000000001')).toBe(1)
    expect(hammingDistance('0000000000000000', '0000000000000007')).toBe(3)
    expect(hammingDistance('0000000000000000', '000000000000000f')).toBe(4)
    expect(hammingDistance('ffffffffffffffff', '0000000000000000')).toBe(64)
  })

  it('is symmetric', () => {
    expect(hammingDistance('01576930e0345324', '01576930e034532c')).toBe(
      hammingDistance('01576930e034532c', '01576930e0345324'),
    )
  })
})

describe('isDuplicate at the distance boundary', () => {
  /**
   * Three bits is the line. Below it ordinary rephrasing separates two posts;
   * above it genuinely different announcements start merging, which is worse —
   * a merged announcement hides one a student needed to see.
   */
  it('is a duplicate at exactly three bits and not at four', () => {
    expect(DUPLICATE_DISTANCE).toBe(3)
    expect(isDuplicate('0000000000000000', '0000000000000007')).toBe(true)
    expect(isDuplicate('0000000000000000', '000000000000000f')).toBe(false)
  })

  it('counts bits wherever in the fingerprint they fall', () => {
    // Three bits spread across the high, middle and low nibbles.
    expect(isDuplicate('0000000000000000', '1000000010000001')).toBe(true)
    expect(isDuplicate('0000000000000000', '1000000110000001')).toBe(false)
  })

  it('accepts an overridden threshold', () => {
    expect(isDuplicate('0000000000000000', '000000000000000f', 4)).toBe(true)
    expect(isDuplicate('0000000000000000', '0000000000000007', 2)).toBe(false)
  })
})

describe('findDuplicate', () => {
  const NOW = new Date('2026-03-16T09:00:00+08:00')
  const HOUR = 3_600_000
  const HASH = '0000000000000000'

  function candidate(id: string, hash: string, hoursAgo: number): DuplicateCandidate {
    return { id, contentHash: hash, createdAt: new Date(NOW.getTime() - hoursAgo * HOUR) }
  }

  it('finds an identical fingerprint inside the window', () => {
    expect(findDuplicate(HASH, [candidate('a', HASH, 2)], NOW)?.id).toBe('a')
  })

  it('finds a near-identical fingerprint at the distance boundary', () => {
    expect(findDuplicate(HASH, [candidate('a', '0000000000000007', 2)], NOW)?.id).toBe('a')
    expect(findDuplicate(HASH, [candidate('a', '000000000000000f', 2)], NOW)).toBeNull()
  })

  it('uses a 48-hour window', () => {
    expect(DUPLICATE_WINDOW_HOURS).toBe(48)
    expect(findDuplicate(HASH, [candidate('a', HASH, 47)], NOW)?.id).toBe('a')
    // Exactly 48 hours old is still inside the window.
    expect(findDuplicate(HASH, [candidate('a', HASH, 48)], NOW)?.id).toBe('a')
  })

  it('treats the same announcement re-shared past the window as a new event', () => {
    expect(findDuplicate(HASH, [candidate('a', HASH, 48.5)], NOW)).toBeNull()
    expect(findDuplicate(HASH, [candidate('a', HASH, 24 * 7)], NOW)).toBeNull()
  })

  it('ignores a candidate stamped in the future', () => {
    expect(findDuplicate(HASH, [candidate('a', HASH, -1)], NOW)).toBeNull()
  })

  it('picks the closest match when several are in range', () => {
    const found = findDuplicate(
      HASH,
      [
        candidate('three-bits', '0000000000000007', 1),
        candidate('exact', HASH, 40),
        candidate('one-bit', '0000000000000001', 2),
      ],
      NOW,
    )
    expect(found?.id).toBe('exact')
  })

  it('returns null against an empty candidate set', () => {
    expect(findDuplicate(HASH, [], NOW)).toBeNull()
  })

  it('accepts an ISO createdAt and an overridden window', () => {
    const iso: DuplicateCandidate = {
      id: 'a',
      contentHash: HASH,
      createdAt: new Date(NOW.getTime() - 60 * HOUR).toISOString(),
    }
    expect(findDuplicate(HASH, [iso], NOW)).toBeNull()
    expect(findDuplicate(HASH, [iso], NOW, 72)?.id).toBe('a')
  })

  it('collapses a real re-share of the same announcement', () => {
    const original = contentHash(ANNOUNCEMENT)
    const reshared = contentHash(`> from the class GC\nMaria Santos: ${ANNOUNCEMENT}`)
    const found = findDuplicate(
      reshared,
      [{ id: 'original', contentHash: original, createdAt: new Date(NOW.getTime() - 3 * HOUR) }],
      NOW,
    )
    expect(found?.id).toBe('original')
  })
})
