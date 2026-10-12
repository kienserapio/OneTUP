/**
 * The assistant's Markdown, parsed to data.
 *
 * The model writes a small, deliberate subset — headings, bullet and numbered
 * lists, bold, italics, inline code, fenced code, quotes, links and simple
 * tables — and this turns it into blocks the screen draws itself. There is no
 * HTML anywhere in the path: the output is plain data rendered as React nodes,
 * so nothing the model (or something it was shown) writes can become markup.
 *
 * Pure, so it is testable. It fails quietly the other way round too: a parser
 * that eats a line of an answer looks like the model forgot something.
 */

export type Inline =
  | { type: 'text'; text: string }
  | { type: 'bold'; children: Inline[] }
  | { type: 'italic'; children: Inline[] }
  | { type: 'code'; text: string }
  | { type: 'link'; href: string; children: Inline[] }

export interface ListItem {
  text: string
  /** 0 for a top-level item, 1 for one nested under it. Deeper is flattened. */
  depth: number
}

export type MdBlock =
  | { kind: 'heading'; level: 1 | 2 | 3; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'ul'; items: ListItem[] }
  | { kind: 'ol'; start: number; items: ListItem[] }
  | { kind: 'quote'; text: string }
  | { kind: 'code'; lang: string; text: string }
  | { kind: 'hr' }
  | { kind: 'table'; head: string[]; rows: string[][] }

const FENCE = /^\s*```\s*([\w+-]*)\s*$/
const HEADING = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/
const RULE = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/
const BULLET = /^(\s*)[-*+•]\s+(.*)$/
const NUMBERED = /^(\s*)(\d{1,3})[.)]\s+(.*)$/
const QUOTE = /^\s{0,3}>\s?(.*)$/
const TABLE_SEPARATOR = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/

const isTableRow = (line: string) => line.includes('|') && line.trim().length > 1

function cells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim())
}

const depthOf = (indent: string) => Math.min(1, Math.floor(indent.replace(/\t/g, '  ').length / 2))

export function parseMarkdown(source: string): MdBlock[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const blocks: MdBlock[] = []
  let paragraph: string[] = []

  const flush = () => {
    const text = paragraph.join('\n').trim()
    if (text) blocks.push({ kind: 'paragraph', text })
    paragraph = []
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    const fence = FENCE.exec(line)
    if (fence) {
      flush()
      const body: string[] = []
      i++
      /* An unclosed fence runs to the end: a model cut off mid-block should
       * still show what it wrote, not swallow it. */
      while (i < lines.length && !FENCE.test(lines[i])) body.push(lines[i++])
      blocks.push({ kind: 'code', lang: fence[1], text: body.join('\n').replace(/\n+$/, '') })
      continue
    }

    if (line.trim() === '') {
      flush()
      continue
    }

    const heading = HEADING.exec(line)
    if (heading) {
      flush()
      blocks.push({
        kind: 'heading',
        level: Math.min(3, heading[1].length) as 1 | 2 | 3,
        text: heading[2],
      })
      continue
    }

    if (RULE.test(line)) {
      flush()
      blocks.push({ kind: 'hr' })
      continue
    }

    if (isTableRow(line) && i + 1 < lines.length && TABLE_SEPARATOR.test(lines[i + 1])) {
      flush()
      const head = cells(line)
      const rows: string[][] = []
      i += 2
      while (i < lines.length && isTableRow(lines[i])) rows.push(cells(lines[i++]))
      i--
      blocks.push({ kind: 'table', head, rows })
      continue
    }

    if (QUOTE.test(line)) {
      flush()
      const quoted: string[] = []
      while (i < lines.length && QUOTE.test(lines[i])) quoted.push(QUOTE.exec(lines[i++])![1])
      i--
      blocks.push({ kind: 'quote', text: quoted.join('\n').trim() })
      continue
    }

    const bullet = BULLET.exec(line)
    const numbered = bullet ? null : NUMBERED.exec(line)
    if ((bullet && bullet[2].trim()) || numbered) {
      flush()
      const ordered = Boolean(numbered)
      const items: ListItem[] = []
      const start = numbered ? Number(numbered[2]) : 1

      while (i < lines.length) {
        const current = lines[i]
        const b = BULLET.exec(current)
        const n = b ? null : NUMBERED.exec(current)

        if (b && !ordered && b[2].trim()) {
          items.push({ text: b[2].trim(), depth: depthOf(b[1]) })
        } else if (n && ordered) {
          items.push({ text: n[3].trim(), depth: depthOf(n[1]) })
        } else if (current.trim() === '') {
          /* A blank line only ends the list if what follows is not another item
           * of the same kind: models space "loose" lists out. */
          const next = lines[i + 1] ?? ''
          const continues = ordered ? NUMBERED.test(next) : BULLET.test(next)
          if (!continues) break
        } else if (/^\s+\S/.test(current) && items.length > 0 && !b && !n) {
          items[items.length - 1].text += ` ${current.trim()}`
        } else {
          break
        }
        i++
      }
      i--
      blocks.push(ordered ? { kind: 'ol', start, items } : { kind: 'ul', items })
      continue
    }

    paragraph.push(line)
  }

  flush()
  return blocks
}

const SAFE_HREF = /^(https?:\/\/|mailto:|\/(?!\/))/i

/**
 * Inline markup: `code`, **bold**, *italic* / _italic_, [text](url).
 *
 * Code is scanned first because nothing inside it is markup. Links are limited
 * to http(s), mailto and in-app paths — a `javascript:` target is shown as its
 * text and goes nowhere.
 */
export function parseInline(text: string): Inline[] {
  const out: Inline[] = []
  let buffer = ''
  let i = 0

  const push = () => {
    if (buffer) out.push({ type: 'text', text: buffer })
    buffer = ''
  }

  while (i < text.length) {
    const rest = text.slice(i)

    if (text[i] === '\\' && i + 1 < text.length && /[\\`*_[\]()#>-]/.test(text[i + 1])) {
      buffer += text[i + 1]
      i += 2
      continue
    }

    if (text[i] === '`') {
      const end = text.indexOf('`', i + 1)
      if (end > i + 1) {
        push()
        out.push({ type: 'code', text: text.slice(i + 1, end) })
        i = end + 1
        continue
      }
    }

    const bold = /^(\*\*|__)(?=\S)([\s\S]+?)(?<=\S)\1/.exec(rest)
    if (bold) {
      push()
      out.push({ type: 'bold', children: parseInline(bold[2]) })
      i += bold[0].length
      continue
    }

    const italic = /^(\*|_)(?=[^\s*_])([\s\S]*?[^\s*_])\1(?![\w*_])/.exec(rest)
    if (italic && (text[i] === '*' || i === 0 || !/\w/.test(text[i - 1]))) {
      push()
      out.push({ type: 'italic', children: parseInline(italic[2]) })
      i += italic[0].length
      continue
    }

    const link = /^\[([^\]]+)\]\(([^)\s]+)\)/.exec(rest)
    if (link) {
      push()
      const children = parseInline(link[1])
      if (SAFE_HREF.test(link[2])) out.push({ type: 'link', href: link[2], children })
      else out.push(...children)
      i += link[0].length
      continue
    }

    buffer += text[i]
    i++
  }

  push()
  return out
}

/** The text of an answer with the markup stripped, for copying to a plain field. */
export function plainText(inline: Inline[]): string {
  return inline
    .map((node) => {
      if (node.type === 'text' || node.type === 'code') return node.text
      return plainText(node.children)
    })
    .join('')
}
