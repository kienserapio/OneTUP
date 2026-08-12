'use client'

import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { spring, transition } from '@/design/motion'

/**
 * The contents column.
 *
 * A docs page without one is a scroll bar with headings in it. This tracks the
 * section under the reader's eye rather than the one that most recently touched
 * the top of the viewport, which is the difference between an index that
 * follows you and an index that jumps ahead of you.
 *
 * Sticky on a wide screen, a horizontal strip on a narrow one — the same list
 * either way, so there is only one thing to keep in step with the page.
 */
export function DocsToc({ sections }: { sections: { id: string; title: string }[] }) {
  const [active, setActive] = useState(sections[0]?.id ?? '')

  useEffect(() => {
    const elements = sections
      .map(({ id }) => document.getElementById(id))
      .filter((element): element is HTMLElement => element !== null)

    if (elements.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(entry.target.id)
        }
      },
      { rootMargin: '-25% 0px -65% 0px' },
    )

    for (const element of elements) observer.observe(element)
    return () => observer.disconnect()
  }, [sections])

  return (
    <nav aria-label="On this page" className="lg:sticky lg:top-28">
      <p
        className="type-caption-2 hidden font-semibold uppercase tracking-widest lg:block"
        style={{ color: 'var(--label-secondary)' }}
      >
        On this page
      </p>

      <ul className="no-scrollbar -mx-1 mt-3 flex gap-1 overflow-x-auto px-1 pb-1 lg:mx-0 lg:mt-2 lg:flex-col lg:overflow-visible lg:px-0">
        {sections.map((section) => {
          const current = active === section.id
          return (
            <li key={section.id} className="shrink-0 lg:shrink">
              <a
                href={`#${section.id}`}
                aria-current={current ? 'true' : undefined}
                className="type-subheadline relative isolate flex min-h-[36px] items-center whitespace-nowrap rounded-[var(--radius-sm)] px-3 py-1.5 transition-colors duration-200 lg:whitespace-normal"
                style={{
                  color: current ? 'var(--crimson-700)' : 'var(--label-secondary)',
                  fontWeight: current ? 600 : 400,
                }}
              >
                {current && (
                  <motion.span
                    aria-hidden
                    layoutId="docs-toc-marker"
                    transition={transition(spring.snap)}
                    className="absolute inset-0 -z-10 rounded-[var(--radius-sm)]"
                    style={{ background: 'var(--accent-subtle)' }}
                  />
                )}
                {section.title}
              </a>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
