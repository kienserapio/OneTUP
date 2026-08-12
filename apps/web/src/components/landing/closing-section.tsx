import { ButtonLink } from '@/components/ui/button'
import { IconMap } from '@/components/ui/icon'
import { RepoLink } from './site-footer'
import { DataBento } from './data-bento'
import { Reveal, Stagger, StaggerItem } from './reveal'

/**
 * What it does with your data, then the ask.
 *
 * The trust points come before the last call to action deliberately. A student
 * deciding whether to hand an ERS password to something a stranger built has one
 * question, and answering it after the button would be answering it too late.
 *
 * The closing card carries no border. It is the last surface on the page and it
 * is already separated by its own tone; outlining it as well turns the end of
 * the argument into a box someone drew around it.
 */
export function ClosingSection() {
  return (
    <>
      <section
        id="trust"
        className="scroll-mt-24 px-5 py-20 md:px-10 md:py-32"
        style={{ background: 'var(--bg)' }}
      >
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <p
              className="type-caption-2 font-semibold uppercase tracking-widest"
              style={{ color: 'var(--label)' }}
            >
              Your data
            </p>
            <h2 className="mt-3 max-w-[20ch] text-3xl leading-[1.15] tracking-tight sm:text-4xl">
              What OneTUP does and doesn&rsquo;t do
            </h2>
          </Reveal>

          <DataBento />
        </div>
      </section>

      <section className="px-5 pb-20 md:px-10 md:pb-32" style={{ background: 'var(--bg)' }}>
        <Reveal
          className="squircle mx-auto max-w-6xl rounded-[25px] px-6 py-16 text-center md:px-16 md:py-24"
          style={{ background: 'var(--surface-sunken)' }}
        >
          <Stagger gap={0.08}>
            <StaggerItem>
              <h2 className="text-3xl leading-[1.15] tracking-tight sm:text-4xl md:text-5xl">
                Ready to stop guessing?
              </h2>
            </StaggerItem>

            <StaggerItem>
              <p
                className="type-body mx-auto mt-5 max-w-[46ch]"
                style={{ color: 'var(--label-secondary)' }}
              >
                Import your schedule once and OneTUP handles the rest — the alarms, the cuts, the
                deadlines, the commute.
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

            <StaggerItem className="mt-14">
              <h3 className="type-headline">Built in the open</h3>
              <p
                className="type-footnote mx-auto mt-2 max-w-[52ch]"
                style={{ color: 'var(--label-secondary)' }}
              >
                If you want to help, or you found something wrong, the repository is the place.
              </p>
              {/* Plain text where no repository is configured. Never a link that
                  goes nowhere. */}
              <p className="type-subheadline mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
                <RepoLink>View the source</RepoLink>
                <span aria-hidden style={{ color: 'var(--label-quaternary)' }}>
                  ·
                </span>
                <RepoLink>Report something wrong</RepoLink>
                <span aria-hidden style={{ color: 'var(--label-quaternary)' }}>
                  ·
                </span>
                <RepoLink>Contribute a route</RepoLink>
              </p>
            </StaggerItem>
          </Stagger>
        </Reveal>
      </section>
    </>
  )
}
