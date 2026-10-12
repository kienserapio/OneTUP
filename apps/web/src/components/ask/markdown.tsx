import type { ReactNode } from 'react'
import Link from 'next/link'
import { parseInline, parseMarkdown, type Inline, type MdBlock } from '@/lib/assistant/markdown'

/**
 * Draws the assistant's Markdown.
 *
 * Built from the parser's data, never from HTML, so there is no way for an
 * answer to inject markup. Words fade in one after another as the answer lands;
 * the delay is capped so a long answer never drags.
 */

/** `base` is how long the block waits before its first word, so blocks arrive in order. */
function Words({ text, base, animate }: { text: string; base: number; animate: boolean }) {
  if (!animate) return <>{text}</>
  return (
    <>
      {text.split(/(\s+)/).map((part, index) =>
        part.trim() === '' ? (
          part
        ) : (
          <span
            key={index}
            className="ask-word"
            style={{ animationDelay: `${Math.min(base + index * 11, 1500)}ms` }}
          >
            {part}
          </span>
        ),
      )}
    </>
  )
}

function renderInline(nodes: Inline[], base: number, animate: boolean): ReactNode {
  return nodes.map((node, index) => {
    switch (node.type) {
      case 'text':
        return <Words key={index} text={node.text} base={base} animate={animate} />
      case 'bold':
        return (
          <strong key={index} className="font-bold text-[var(--label)]">
            {renderInline(node.children, base, animate)}
          </strong>
        )
      case 'italic':
        return <em key={index}>{renderInline(node.children, base, animate)}</em>
      case 'code':
        return (
          <code
            key={index}
            className="rounded-md px-1.5 py-0.5 text-[0.85em] font-semibold"
            style={{ background: 'var(--fill-quaternary)', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
          >
            {node.text}
          </code>
        )
      case 'link': {
        const children = renderInline(node.children, base, animate)
        const className = 'font-semibold text-[var(--accent)] underline decoration-[color-mix(in_srgb,var(--accent)_35%,transparent)] underline-offset-2'
        return node.href.startsWith('/') ? (
          <Link key={index} href={node.href as never} className={className}>
            {children}
          </Link>
        ) : (
          <a key={index} href={node.href} target="_blank" rel="noopener noreferrer" className={className}>
            {children}
          </a>
        )
      }
    }
  })
}

function Inlines({ text, base, animate }: { text: string; base: number; animate: boolean }) {
  return <>{renderInline(parseInline(text), base, animate)}</>
}

const HEADING_CLASS = {
  1: 'text-[1.25rem] font-bold tracking-[-0.025em]',
  2: 'text-[1.0625rem] font-bold tracking-[-0.02em]',
  3: 'text-[0.9375rem] font-bold tracking-[-0.01em] text-[var(--label-secondary)]',
} as const

function Block({ block, base, animate }: { block: MdBlock; base: number; animate: boolean }) {
  switch (block.kind) {
    case 'heading': {
      const Tag = block.level === 1 ? 'h3' : block.level === 2 ? 'h4' : 'h5'
      return (
        <Tag className={`${HEADING_CLASS[block.level]} leading-snug [&:not(:first-child)]:pt-1.5`}>
          <Inlines text={block.text} base={base} animate={animate} />
        </Tag>
      )
    }
    case 'paragraph':
      return (
        <p className="whitespace-pre-wrap">
          <Inlines text={block.text} base={base} animate={animate} />
        </p>
      )
    case 'ul':
      return (
        <ul className="space-y-1.5">
          {block.items.map((item, index) => (
            <li key={index} className="flex gap-2.5" style={{ paddingLeft: item.depth * 20 }}>
              <span
                aria-hidden
                className="size-1.5 shrink-0 rounded-full"
                style={{
                  marginTop: '0.68em',
                  background: item.depth ? 'var(--label-quaternary)' : 'var(--accent)',
                }}
              />
              <span className="min-w-0 flex-1">
                <Inlines text={item.text} base={base} animate={animate} />
              </span>
            </li>
          ))}
        </ul>
      )
    case 'ol': {
      let number = block.start - 1
      return (
        <ol className="space-y-2">
          {block.items.map((item, index) => {
            if (item.depth === 0) number++
            return (
              <li key={index} className="flex gap-2.5" style={{ paddingLeft: item.depth * 20 }}>
                {item.depth === 0 ? (
                  <span
                    aria-hidden
                    className="grid size-[1.375rem] shrink-0 place-items-center rounded-full text-[0.75rem] font-bold tabular-nums"
                    style={{ marginTop: '0.15em', background: 'var(--accent-subtle)', color: 'var(--accent)' }}
                  >
                    {number}
                  </span>
                ) : (
                  <span
                    aria-hidden
                    className="size-1.5 shrink-0 rounded-full"
                    style={{ marginTop: '0.68em', background: 'var(--label-quaternary)' }}
                  />
                )}
                <span className="min-w-0 flex-1">
                  <Inlines text={item.text} base={base} animate={animate} />
                </span>
              </li>
            )
          })}
        </ol>
      )
    }
    case 'quote':
      return (
        <blockquote
          className="rounded-r-xl border-l-[3px] py-1 pl-3.5 text-[var(--label-secondary)]"
          style={{ borderColor: 'var(--accent)' }}
        >
          <Inlines text={block.text} base={base} animate={animate} />
        </blockquote>
      )
    case 'code':
      return (
        <pre
          className="overflow-x-auto rounded-2xl px-4 py-3 text-[0.8125rem] font-medium leading-relaxed"
          style={{
            background: 'var(--bg)',
            boxShadow: 'inset 0 0 0 1px rgb(24 24 27 / 0.06)',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          }}
        >
          <code>{block.text}</code>
        </pre>
      )
    case 'hr':
      return <hr className="border-0 border-t" style={{ borderColor: 'var(--separator-opaque)' }} />
    case 'table':
      return (
        <div
          className="overflow-x-auto rounded-2xl"
          style={{ background: 'var(--bg)', boxShadow: 'inset 0 0 0 1px rgb(24 24 27 / 0.06)' }}
        >
          <table className="w-full border-collapse text-left text-[0.875rem]">
            <thead>
              <tr>
                {block.head.map((cell, index) => (
                  <th
                    key={index}
                    className="whitespace-nowrap px-3.5 py-2.5 text-[0.75rem] font-bold uppercase tracking-wide text-[var(--label-tertiary)]"
                  >
                    <Inlines text={cell} base={0} animate={false} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="border-t" style={{ borderColor: 'var(--separator)' }}>
                  {row.map((cell, index) => (
                    <td key={index} className="px-3.5 py-2.5 align-top font-medium">
                      <Inlines text={cell} base={0} animate={false} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
  }
}

export function Markdown({ text, animate = true }: { text: string; animate?: boolean }) {
  return (
    <div className="space-y-3 text-[0.96875rem] font-medium leading-[1.65] tracking-[-0.003em]">
      {parseMarkdown(text).map((block, index) => (
        <Block key={index} block={block} base={Math.min(index * 160, 900)} animate={animate} />
      ))}
    </div>
  )
}
