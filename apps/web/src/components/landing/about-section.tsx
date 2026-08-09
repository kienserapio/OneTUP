import type { ReactNode } from 'react'
import Link from 'next/link'
import { cx } from '@/lib/cx'
import { IconCampus, IconToday } from '@/components/ui/icon'
import { Mark } from './mark'

/**
 * The problem, then the position.
 *
 * The rounded top edge overlaps the hero by the 25px the hero gives back as a
 * negative margin, so the page reads as one sheet sliding over another rather
 * than as two stacked blocks.
 */

function PillLink({
  href,
  icon,
  tone,
  children,
}: {
  href: '/today' | '/campus'
  icon: ReactNode
  tone: 'primary' | 'secondary'
  children: ReactNode
}) {
  return (
    <Link
      href={href}
      className={cx(
        'type-headline inline-flex min-h-[52px] items-center gap-3 rounded-full py-1.5 pl-1.5 pr-6',
        'transition-[filter] duration-200 hover:brightness-95 active:brightness-90',
      )}
      style={
        tone === 'primary'
          ? { background: 'var(--accent)', color: 'var(--on-accent)' }
          : { background: 'var(--accent-subtle)', color: 'var(--crimson-700)' }
      }
    >
      <span
        aria-hidden
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full"
        style={{ background: 'var(--bg)', color: 'var(--accent)' }}
      >
        {icon}
      </span>
      {children}
    </Link>
  )
}

export function AboutSection() {
  return (
    <section
      className="relative z-10 rounded-t-[25px] px-6 py-20 md:py-32"
      style={{ background: 'var(--bg)' }}
    >
      <div className="mx-auto max-w-lg text-center">
        <h2 className="text-2xl leading-[1.2] tracking-tight sm:text-3xl">
          You already have a system. It&rsquo;s six group chats and a Notes app.
        </h2>

        <p className="type-body mt-6" style={{ color: 'var(--label-secondary)' }}>
          Your schedule is in ERS. Your deadlines are in whichever GC someone remembered to post in.
          Your grades are wherever you last did the maths by hand. Your cuts are in your head, until
          the day you find out you were wrong.
        </p>

        <p className="type-body mt-4" style={{ color: 'var(--label-secondary)' }}>
          None of it talks to each other. All of it is your job to keep track of, on top of actually
          studying. OneTUP is the part that keeps track.
        </p>

        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <PillLink href="/today" tone="primary" icon={<IconToday size={20} />}>
            Open OneTUP
          </PillLink>
          <PillLink href="/campus" tone="secondary" icon={<IconCampus size={20} />}>
            Browse the campus map
          </PillLink>
        </div>
      </div>

      <div className="mx-auto mt-20 flex max-w-6xl items-center gap-3" aria-hidden>
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ background: 'var(--separator)' }}
        />
        <span className="h-px flex-1" style={{ background: 'var(--separator)' }} />
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ background: 'var(--separator)' }}
        />
      </div>

      <div className="mx-auto mt-20 flex max-w-6xl flex-col gap-10 md:flex-row md:gap-16">
        <div className="flex items-start gap-4 md:w-[200px] md:shrink-0">
          <Mark size={40} className="shrink-0" />
          <span
            className="text-xs font-semibold uppercase leading-[1.5] tracking-widest"
            style={{ color: 'var(--label)' }}
          >
            Built
            <br />
            by students
          </span>
        </div>

        <p className="text-2xl leading-[1.3] tracking-tight sm:text-3xl md:text-4xl">
          Import your schedule once. Everything else builds on it. OneTUP is a student project. The
          client is open source, and the campus and curriculum data behind it is published as a free
          API that anyone can build on — thesis projects, org tools, hackathon entries.
        </p>
      </div>
    </section>
  )
}
