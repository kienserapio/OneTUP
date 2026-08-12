import { ButtonLink } from '@/components/ui/button'
import { IconMap } from '@/components/ui/icon'
import { Mark } from '@/components/ui/mark'
import { Reveal, Stagger, StaggerItem } from './reveal'

/**
 * The problem, then the position.
 *
 * The rounded top edge overlaps the hero by the 25px the hero gives back as a
 * negative margin, so the page reads as one sheet sliding over another rather
 * than as two stacked blocks.
 *
 * The two actions here are the same two controls as the hero and the closing
 * card — same variants, same size, same order. A landing page that invents a
 * new button for every section teaches the visitor that buttons mean nothing.
 */
export function AboutSection() {
  return (
    <section
      id="about"
      className="relative z-10 scroll-mt-24 rounded-t-[25px] px-6 py-20 md:py-32"
      style={{ background: 'var(--bg)' }}
    >
      <Stagger className="mx-auto max-w-lg text-center" gap={0.09}>
        <StaggerItem>
          <h2 className="text-2xl leading-[1.2] tracking-tight sm:text-3xl">
            You already have a system. It&rsquo;s six group chats and a Notes app.
          </h2>
        </StaggerItem>

        <StaggerItem>
          <p className="type-body mt-6" style={{ color: 'var(--label-secondary)' }}>
            Your schedule is in ERS. Your deadlines are in whichever GC someone remembered to post
            in. Your grades are wherever you last did the maths by hand. Your cuts are in your head,
            until the day you find out you were wrong.
          </p>
        </StaggerItem>

        <StaggerItem>
          <p className="type-body mt-4" style={{ color: 'var(--label-secondary)' }}>
            None of it talks to each other. All of it is your job to keep track of, on top of
            actually studying. OneTUP is the part that keeps track.
          </p>
        </StaggerItem>

        <StaggerItem className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <ButtonLink href="/today" variant="accent" size="lg" block className="sm:!w-auto">
            Open OneTUP
          </ButtonLink>
          <ButtonLink
            href="/campus"
            size="lg"
            block
            className="sm:!w-auto"
            leading={<IconMap size={19} className="shrink-0" />}
          >
            View Campus Map
          </ButtonLink>
        </StaggerItem>
      </Stagger>

      <Reveal className="mx-auto mt-20 flex max-w-6xl items-center gap-3" amount={0.6}>
        <span aria-hidden className="contents">
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ background: 'var(--separator)' }}
          />
          <span className="h-px flex-1" style={{ background: 'var(--separator)' }} />
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ background: 'var(--separator)' }}
          />
        </span>
      </Reveal>

      <Stagger
        className="mx-auto mt-20 flex max-w-6xl flex-col gap-10 md:flex-row md:gap-16"
        gap={0.12}
      >
        <StaggerItem className="flex items-start gap-4 md:w-[200px] md:shrink-0">
          <Mark size={40} className="shrink-0" />
          <span
            className="text-xs font-semibold uppercase leading-[1.5] tracking-widest"
            style={{ color: 'var(--label)' }}
          >
            Built
            <br />
            by students
          </span>
        </StaggerItem>

        <StaggerItem>
          <p className="text-2xl leading-[1.3] tracking-tight sm:text-3xl md:text-4xl">
            Import your schedule once. Everything else builds on it. OneTUP is a student project.
            The client is open source, and the campus and curriculum data behind it is published as
            a free API that anyone can build on — thesis projects, org tools, hackathon entries.
          </p>
        </StaggerItem>
      </Stagger>
    </section>
  )
}
