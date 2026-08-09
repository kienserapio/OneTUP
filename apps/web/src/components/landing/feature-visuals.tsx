import type { ReactNode } from 'react'
import {
  IconAlarm,
  IconAnnouncement,
  IconCheck,
  IconClose,
  IconCommute,
  IconDeadlines,
  IconWarning,
} from '@/components/ui/icon'

/**
 * The six visuals.
 *
 * Each one is the screen it describes, built from the same tokens and the same
 * components the app itself uses — not a screenshot, not a placeholder, not a
 * stock illustration. A student reading a claim about counted cuts has to take
 * it on trust; a student looking at the row that counts them does not.
 *
 * The numbers are sample data, kept to the ones the content spec already uses
 * (the 5:40 departure, the ₱41 fare, CS 3105) so nothing here promises anything
 * the product does not do.
 */

function Frame({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div
      className="squircle overflow-hidden rounded-[var(--radius-md)] border"
      style={{ borderColor: 'var(--separator)', background: 'var(--surface-sunken)' }}
    >
      <p
        className="type-caption-2 border-b px-4 py-2 font-semibold uppercase tracking-widest"
        style={{ borderColor: 'var(--separator-soft)', color: 'var(--label-secondary)' }}
      >
        {label}
      </p>
      <div className="p-4">{children}</div>
    </div>
  )
}

/** A control the mock only depicts. Never a real button — a dead affordance is
 * worse than a picture of one. */
function MockAction({ children, tone }: { children: ReactNode; tone?: 'accent' }) {
  return (
    <span
      className="type-footnote inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-semibold"
      style={
        tone === 'accent'
          ? { background: 'var(--accent)', color: 'var(--on-accent)' }
          : { background: 'var(--fill-quaternary)', color: 'var(--label-secondary)' }
      }
    >
      {children}
    </span>
  )
}

export function DepartureVisual() {
  const steps = [
    { time: '4:55 AM', label: 'Wake up' },
    { time: '5:40 AM', label: 'Leave the house' },
    { time: '7:00 AM', label: 'CS 3105 — Rm 312' },
  ]

  return (
    <Frame label="Today">
      <ol className="flex flex-col">
        {steps.map((step, index) => (
          <li key={step.time} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                style={{ background: index === 1 ? 'var(--accent)' : 'var(--label-quaternary)' }}
              />
              {index < steps.length - 1 && (
                <span className="w-px flex-1" style={{ background: 'var(--separator)' }} />
              )}
            </div>
            <div className="pb-4">
              <p className="type-data type-footnote" style={{ color: 'var(--label-secondary)' }}>
                {step.time}
              </p>
              <p className="type-callout font-semibold">{step.label}</p>
            </div>
          </li>
        ))}
      </ol>

      <p
        className="type-footnote flex items-start gap-2 rounded-[var(--radius-sm)] p-3"
        style={{ background: 'var(--bg)', color: 'var(--label-secondary)' }}
      >
        <IconAlarm size={17} className="mt-px shrink-0" style={{ color: 'var(--accent)' }} />
        Rush hour adds about 20 minutes on LRT-1 and rain is forecast at 6&nbsp;AM, so your alarm
        moved 15 minutes earlier.
      </p>
    </Frame>
  )
}

export function AttendanceVisual() {
  return (
    <Frame label="After class">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="type-callout font-semibold">CS 3105 — were you there?</p>
        <div className="flex gap-2">
          <MockAction tone="accent">
            <IconCheck size={15} strokeWidth={2.4} />
            Yes
          </MockAction>
          <MockAction>
            <IconClose size={15} strokeWidth={2.4} />
            No
          </MockAction>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <div
          className="h-1.5 flex-1 overflow-hidden rounded-full"
          style={{ background: 'var(--fill-tertiary)' }}
        >
          <span
            className="block h-full rounded-full"
            style={{ width: '89%', background: 'var(--warning)' }}
          />
        </div>
        <p className="type-data type-footnote" style={{ color: 'var(--label-secondary)' }}>
          8 of 9 absences
        </p>
      </div>

      <p
        className="type-footnote mt-3 flex items-start gap-2"
        style={{ color: 'var(--label-secondary)' }}
      >
        <IconWarning size={17} className="mt-px shrink-0" style={{ color: 'var(--warning)' }} />
        One more absence in CS 3105 and it affects your grade.
      </p>
    </Frame>
  )
}

export function GwaVisual() {
  return (
    <Frame label="Grades">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="type-caption-1" style={{ color: 'var(--label-secondary)' }}>
            GWA this term
          </p>
          <p className="type-figure mt-1">1.75</p>
        </div>
        <div className="text-right">
          <p className="type-caption-1" style={{ color: 'var(--label-secondary)' }}>
            Target
          </p>
          <p className="type-data type-title-2 mt-1" style={{ color: 'var(--accent)' }}>
            1.50
          </p>
        </div>
      </div>

      <div
        className="mt-4 flex flex-col gap-2 rounded-[var(--radius-sm)] p-3"
        style={{ background: 'var(--bg)' }}
      >
        {[
          { subject: 'CS 3105', needed: '1.25' },
          { subject: 'CS 3107', needed: '1.50' },
          { subject: 'GEED 10123', needed: '1.75' },
        ].map((row) => (
          <p key={row.subject} className="type-footnote flex items-center justify-between gap-3">
            <span style={{ color: 'var(--label-secondary)' }}>{row.subject}</span>
            <span className="type-data font-semibold">needs {row.needed}</span>
          </p>
        ))}
      </div>
    </Frame>
  )
}

export function DeadlinesVisual() {
  const items = [
    { title: 'Sprint 2 documentation', subject: 'CS 3105', due: 'Tomorrow' },
    { title: 'Long quiz', subject: 'CS 3107', due: 'Friday' },
    { title: 'Reflection paper', subject: 'GEED 10123', due: 'Next Tuesday' },
  ]

  return (
    <Frame label="Due next">
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li
            key={item.title}
            className="flex items-center gap-3 rounded-[var(--radius-sm)] p-3"
            style={{ background: 'var(--bg)' }}
          >
            <IconDeadlines
              size={20}
              className="shrink-0"
              style={{ color: 'var(--label-tertiary)' }}
            />
            <span className="min-w-0 flex-1">
              <span className="type-callout block truncate font-semibold">{item.title}</span>
              <span
                className="type-caption-1 block truncate"
                style={{ color: 'var(--label-secondary)' }}
              >
                {item.subject}
              </span>
            </span>
            <span className="type-data type-caption-1 shrink-0" style={{ color: 'var(--accent)' }}>
              {item.due}
            </span>
          </li>
        ))}
      </ul>
    </Frame>
  )
}

export function AnnouncementsVisual() {
  return (
    <Frame label="From your section">
      <div className="flex gap-3">
        <IconAnnouncement size={20} className="mt-0.5 shrink-0" style={{ color: 'var(--accent)' }} />
        <div className="min-w-0 flex-1">
          <p className="type-callout font-semibold">CS 3107: long quiz moved to Friday</p>
          <p className="type-caption-1 mt-1" style={{ color: 'var(--label-secondary)' }}>
            Posted once by your beadle · everyone in the section has it
          </p>
          <div className="mt-3">
            <MockAction tone="accent">Make it a deadline</MockAction>
          </div>
        </div>
      </div>

      <p
        className="type-footnote mt-4 border-t pt-3"
        style={{ borderColor: 'var(--separator-soft)', color: 'var(--label-secondary)' }}
      >
        Classes suspended today.
      </p>
    </Frame>
  )
}

export function CommuteVisual() {
  const legs = ['Jeep to Monumento', 'LRT-1 to Central Terminal', '8-minute walk']

  return (
    <Frame label="Grace Park → TUP Manila">
      <ol className="flex flex-col gap-2">
        {legs.map((leg, index) => (
          <li key={leg} className="flex items-center gap-3">
            <span
              className="type-caption-2 grid h-6 w-6 shrink-0 place-items-center rounded-full font-semibold"
              style={{ background: 'var(--fill-quaternary)', color: 'var(--label-secondary)' }}
            >
              {index + 1}
            </span>
            <span className="type-callout">{leg}</span>
          </li>
        ))}
      </ol>

      <div
        className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-[var(--radius-sm)] p-3"
        style={{ background: 'var(--bg)' }}
      >
        <IconCommute size={20} className="shrink-0" style={{ color: 'var(--accent)' }} />
        <p className="type-data type-callout font-semibold">55 minutes · ₱41</p>
        <p className="type-footnote" style={{ color: 'var(--label-secondary)' }}>
          student discount applied
        </p>
      </div>
    </Frame>
  )
}
