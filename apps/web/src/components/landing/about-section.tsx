import { ButtonLink } from '@/components/ui/button'
import { IconClassroom, IconMap, IconStudy, IconToday } from '@/components/ui/icon'
import { Watermark } from '@/components/ui/watermark'
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
      className="relative z-10 scroll-mt-24 rounded-t-[25px] px-5 pb-14 pt-20 md:px-10 md:pb-20 md:pt-32"
      style={{ background: 'var(--canvas)' }}
    >
      <Reveal className="mx-auto max-w-3xl">
        <div className="card-glass px-6 py-12 text-center sm:px-12 sm:py-16" style={{ borderRadius: '32px' }}>
          <Watermark Icon={IconClassroom} size={220} />
          <Stagger className="mx-auto max-w-lg" gap={0.09}>
        <StaggerItem>
          <h2 className="text-[1.75rem] leading-[1.15] sm:text-[2.25rem]">
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
          <ButtonLink
            href="/today"
            variant="accent"
            size="lg"
            block
            className="sm:!w-auto"
            leading={<IconToday size={20} className="shrink-0" />}
          >
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
        </div>
      </Reveal>

      {/* The one crimson card on the page: who it is from. */}
      <Reveal className="mx-auto mt-6 max-w-3xl md:mt-8" amount={0.3}>
        <div
          data-tone="crimson"
          className="card-glass px-6 py-10 sm:px-12 sm:py-14"
          style={{ borderRadius: '32px', color: 'var(--on-accent)' }}
        >
          <Watermark Icon={IconStudy} size={200} />
          <div className="flex items-center gap-3">
            <Mark size={36} color="var(--on-accent)" className="shrink-0" />
            <span
              className="text-xs font-bold uppercase leading-[1.5] tracking-[0.12em]"
              style={{ color: 'rgb(255 255 255 / 0.8)' }}
            >
              Built by students
            </span>
          </div>
          <p className="mt-6 text-[1.375rem] font-semibold leading-[1.35] tracking-[-0.02em] sm:text-[1.75rem]">
            Import your schedule once. Everything else builds on it. OneTUP is a student project.
            The client is open source, and the campus and curriculum data behind it is published as
            a free API that anyone can build on — thesis projects, org tools, hackathon entries.
          </p>
        </div>
      </Reveal>
    </section>
  )
}
