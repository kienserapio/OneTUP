import { describe, expect, it } from 'vitest'
import { parseInline, parseMarkdown } from '@/lib/assistant/markdown'

/**
 * The answer renderer's parser. A chat reply with no formatting has to come
 * through untouched, and a formatted one has to keep every line it was sent.
 */

describe('parseMarkdown', () => {
  it('leaves a plain reply as a single paragraph', () => {
    expect(parseMarkdown('Two cuts left in CS 2103.')).toEqual([
      { kind: 'paragraph', text: 'Two cuts left in CS 2103.' },
    ])
  })

  it('keeps single line breaks inside a paragraph', () => {
    expect(parseMarkdown('First\nsecond')).toEqual([{ kind: 'paragraph', text: 'First\nsecond' }])
  })

  it('reads headings and clamps the level to three', () => {
    const blocks = parseMarkdown('# One\n## Two\n###### Six')
    expect(blocks.map((b) => (b.kind === 'heading' ? b.level : 0))).toEqual([1, 2, 3])
  })

  it('reads bullets with -, * and +', () => {
    expect(parseMarkdown('- a\n* b\n+ c')).toEqual([
      {
        kind: 'ul',
        items: [
          { text: 'a', depth: 0 },
          { text: 'b', depth: 0 },
          { text: 'c', depth: 0 },
        ],
      },
    ])
  })

  it('reads a numbered list and keeps where it starts', () => {
    const [block] = parseMarkdown('3. three\n4. four')
    expect(block).toEqual({
      kind: 'ol',
      start: 3,
      items: [
        { text: 'three', depth: 0 },
        { text: 'four', depth: 0 },
      ],
    })
  })

  it('nests one level and flattens anything deeper', () => {
    const [block] = parseMarkdown('- a\n  - b\n      - c')
    expect(block.kind === 'ul' && block.items.map((i) => i.depth)).toEqual([0, 1, 1])
  })

  it('keeps a loose list together across blank lines', () => {
    const blocks = parseMarkdown('1. one\n\n2. two\n\n3. three')
    expect(blocks).toHaveLength(1)
    expect(blocks[0].kind === 'ol' && blocks[0].items).toHaveLength(3)
  })

  it('folds an indented continuation line into its item', () => {
    const [block] = parseMarkdown('- long item\n  that wraps')
    expect(block.kind === 'ul' && block.items[0].text).toBe('long item that wraps')
  })

  it('does not take a dash in prose, a bare hyphen or a negative number for a list', () => {
    expect(parseMarkdown('Left - use them')[0].kind).toBe('paragraph')
    expect(parseMarkdown('- ')[0].kind).toBe('paragraph')
    expect(parseMarkdown('-5 is a number')[0].kind).toBe('paragraph')
  })

  it('ends a list when prose resumes', () => {
    expect(parseMarkdown('- a\n- b\n\nDone.').map((b) => b.kind)).toEqual(['ul', 'paragraph'])
  })

  it('reads fenced code and keeps it literal', () => {
    const [block] = parseMarkdown('```ts\nconst a = **1**\n- not a list\n```')
    expect(block).toEqual({ kind: 'code', lang: 'ts', text: 'const a = **1**\n- not a list' })
  })

  it('shows an unclosed fence rather than swallowing it', () => {
    const [block] = parseMarkdown('```\nhalf written')
    expect(block).toEqual({ kind: 'code', lang: '', text: 'half written' })
  })

  it('reads a table', () => {
    const [block] = parseMarkdown('| A | B |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |')
    expect(block).toEqual({
      kind: 'table',
      head: ['A', 'B'],
      rows: [
        ['1', '2'],
        ['3', '4'],
      ],
    })
  })

  it('reads a quote and a rule', () => {
    expect(parseMarkdown('> note\n> more').map((b) => b.kind)).toEqual(['quote'])
    expect(parseMarkdown('above\n\n---\n\nbelow').map((b) => b.kind)).toEqual([
      'paragraph',
      'hr',
      'paragraph',
    ])
  })

  it('produces nothing for empty text', () => {
    expect(parseMarkdown('')).toEqual([])
    expect(parseMarkdown('  \n \n')).toEqual([])
  })
})

describe('parseInline', () => {
  it('returns plain text as one node', () => {
    expect(parseInline('just words')).toEqual([{ type: 'text', text: 'just words' }])
  })

  it('reads bold, italic and code', () => {
    expect(parseInline('a **b** *c* `d`')).toEqual([
      { type: 'text', text: 'a ' },
      { type: 'bold', children: [{ type: 'text', text: 'b' }] },
      { type: 'text', text: ' ' },
      { type: 'italic', children: [{ type: 'text', text: 'c' }] },
      { type: 'text', text: ' ' },
      { type: 'code', text: 'd' },
    ])
  })

  it('nests italic inside bold', () => {
    const [node] = parseInline('**very *much***')
    expect(node.type).toBe('bold')
  })

  it('treats markup inside code as literal', () => {
    expect(parseInline('`**x**`')).toEqual([{ type: 'code', text: '**x**' }])
  })

  it('leaves a lone asterisk and snake_case alone', () => {
    expect(parseInline('5 * 3 and my_var_name')).toEqual([
      { type: 'text', text: '5 * 3 and my_var_name' },
    ])
  })

  it('links http, mailto and in-app paths only', () => {
    expect(parseInline('[x](https://tup.edu.ph)')[0].type).toBe('link')
    expect(parseInline('[x](/deadlines)')[0].type).toBe('link')
    expect(parseInline('[x](javascript:alert(1))').some((node) => node.type === 'link')).toBe(false)
    expect(parseInline('[x](//evil.test)')).toEqual([{ type: 'text', text: 'x' }])
  })

  it('unescapes a backslashed marker', () => {
    expect(parseInline('\\*not italic\\*')).toEqual([{ type: 'text', text: '*not italic*' }])
  })
})
