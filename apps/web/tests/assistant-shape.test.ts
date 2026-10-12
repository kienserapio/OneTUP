import { describe, expect, it } from 'vitest'
import { historyFrom } from '@/lib/assistant/conversation'

/**
 * The assistant's memory. It fails quietly: a history that drops the wrong
 * turns makes follow-ups stop working with no error anywhere.
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
