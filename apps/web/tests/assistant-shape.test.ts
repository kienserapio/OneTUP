import { describe, expect, it } from 'vitest'
import { historyFrom, splitIntoBlocks } from '@/lib/assistant/conversation'

/**
 * The two pure pieces of the assistant's memory and its answer shape.
 *
 * Both fail quietly. A history that drops the wrong turns makes follow-ups stop
 * working with no error anywhere; a renderer that misses a bullet shows the
 * student a literal hyphen and looks like the model misbehaving.
 */

const turn = (role: 'student' | 'assistant', text: string, error = false) => ({
  id: `${role}-${text}`,
  role,
  text,
  error,
})

describe('historyFrom', () => {
  it('is empty at the start of a conversation', () => {
    expect(historyFrom([])).toEqual([])
  })

  it('keeps the order the model reads in — oldest first', () => {
    const history = historyFrom([
      turn('student', 'ilang cuts pa ako sa CS 2103?'),
      turn('assistant', 'Two left out of nine.'),
    ])
    expect(history.map((h) => h.role)).toEqual(['student', 'assistant'])
    expect(history[0].text).toBe('ilang cuts pa ako sa CS 2103?')
  })

  /* The cap the request schema enforces. Sending more is simply rejected. */
  it('never sends more than six turns', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      turn(i % 2 === 0 ? 'student' : 'assistant', `turn ${i}`),
    )
    const history = historyFrom(many)
    expect(history).toHaveLength(6)
    // And it is the *last* six, not the first.
    expect(history[5].text).toBe('turn 19')
  })

  /* "That did not work, try again" is the app talking about itself. Feeding it
   * back has the model apologising for an outage that is over. */
  it('drops error turns', () => {
    const history = historyFrom([
      turn('student', 'what is due?'),
      turn('assistant', 'That did not work. Try again in a moment.', true),
      turn('student', 'and tomorrow?'),
    ])
    expect(history.map((h) => h.text)).toEqual(['what is due?', 'and tomorrow?'])
  })

  it('drops an empty turn rather than sending a blank line', () => {
    expect(historyFrom([turn('assistant', '   ')])).toEqual([])
  })

  it('truncates a very long turn to the schema limit', () => {
    const history = historyFrom([turn('assistant', 'x'.repeat(5000))])
    expect(history[0].text).toHaveLength(2000)
  })
})

describe('splitIntoBlocks', () => {
  it('leaves a plain sentence as one block', () => {
    const blocks = splitIntoBlocks('You have two absences left in CS 2103.')
    expect(blocks).toEqual([{ kind: 'text', text: 'You have two absences left in CS 2103.' }])
  })

  it('turns consecutive "- " lines into one list', () => {
    const blocks = splitIntoBlocks('Try this:\n- Read the brief\n- Draft an outline\n- Sleep on it')
    expect(blocks).toHaveLength(2)
    expect(blocks[0]).toEqual({ kind: 'text', text: 'Try this:' })
    expect(blocks[1]).toEqual({
      kind: 'list',
      items: ['Read the brief', 'Draft an outline', 'Sleep on it'],
    })
  })

  it('closes a list when prose resumes', () => {
    const blocks = splitIntoBlocks('- One\n- Two\n\nThat is the whole method.')
    expect(blocks.map((b) => b.kind)).toEqual(['list', 'text'])
  })

  it('handles a list that is the entire answer', () => {
    const blocks = splitIntoBlocks('- One\n- Two')
    expect(blocks).toEqual([{ kind: 'list', items: ['One', 'Two'] }])
  })

  /* A hyphen used as a dash mid-sentence is not a bullet, and neither is a
   * negative number at the start of a line. */
  it('does not mistake a dash inside prose for a bullet', () => {
    const blocks = splitIntoBlocks('Two absences left - use them carefully.')
    expect(blocks).toEqual([{ kind: 'text', text: 'Two absences left - use them carefully.' }])
  })

  it('ignores a bare hyphen with nothing after it', () => {
    const blocks = splitIntoBlocks('- ')
    expect(blocks).toEqual([{ kind: 'text', text: '-' }])
  })

  /* Every other markdown construct stays literal. The prompt forbids them, and
   * showing the asterisks is the honest outcome when one slips through. */
  it('leaves other markdown as literal text', () => {
    const blocks = splitIntoBlocks('**Bold** and `code` and # heading')
    expect(blocks).toEqual([{ kind: 'text', text: '**Bold** and `code` and # heading' }])
  })

  it('keeps a multi-line paragraph together', () => {
    const blocks = splitIntoBlocks('First line\nsecond line')
    expect(blocks).toEqual([{ kind: 'text', text: 'First line\nsecond line' }])
  })

  it('produces nothing at all for empty text', () => {
    expect(splitIntoBlocks('')).toEqual([])
    expect(splitIntoBlocks('   \n  ')).toEqual([])
  })
})
