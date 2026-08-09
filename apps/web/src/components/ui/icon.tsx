import type { SVGProps } from 'react'

/**
 * Icons.
 *
 * Drawn to SF Symbols' proportions — 24px box, 1.75 stroke, round caps and
 * joins, optically centred — so they sit correctly beside SF Pro text. They
 * inherit `currentColor`, which is what lets a tab item tint as one piece.
 */

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function Base({ size = 24, children, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  )
}

export function IconToday(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5V12l3 2" />
    </Base>
  )
}

export function IconSchedule(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="3" y="4.5" width="18" height="16" rx="3.5" />
      <path d="M3 9.5h18M8 3v3M16 3v3" />
      <path d="M7.5 13.5h4M7.5 17h7" />
    </Base>
  )
}

export function IconAsk(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 3.5 13.4 8a4 4 0 0 0 2.6 2.6l4.5 1.4-4.5 1.4A4 4 0 0 0 13.4 16L12 20.5 10.6 16A4 4 0 0 0 8 13.4L3.5 12 8 10.6A4 4 0 0 0 10.6 8z" />
    </Base>
  )
}

export function IconDeadlines(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M8 4.5h8a2.5 2.5 0 0 1 2.5 2.5v11A2.5 2.5 0 0 1 16 20.5H8A2.5 2.5 0 0 1 5.5 18V7A2.5 2.5 0 0 1 8 4.5z" />
      <path d="M9 3.5h6v2H9z" fill="currentColor" stroke="none" />
      <path d="M9 11.5l1.8 1.8L14.5 9.5" />
      <path d="M9 16.5h6" />
    </Base>
  )
}

export function IconSubjects(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10a2 2 0 0 1 2 2v13a2 2 0 0 0-2-2H5.5A1.5 1.5 0 0 1 4 15.5z" />
      <path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H14a2 2 0 0 0-2 2v13a2 2 0 0 1 2-2h4.5a1.5 1.5 0 0 0 1.5-1.5z" />
    </Base>
  )
}

export function IconCommute(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="5" y="3.5" width="14" height="13" rx="3" />
      <path d="M5 11h14M8.5 20.5l1.5-4M15.5 20.5 14 16.5" />
      <circle cx="8.75" cy="13.75" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="15.25" cy="13.75" r="0.9" fill="currentColor" stroke="none" />
    </Base>
  )
}

export function IconAnnouncement(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4 10v4a1.5 1.5 0 0 0 1.5 1.5H8l6 4.5V5.5L8 10H5.5A1.5 1.5 0 0 0 4 11.5z" />
      <path d="M17.5 9a4.5 4.5 0 0 1 0 6" />
    </Base>
  )
}

export function IconCampus(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 21c4-4.2 6-7.3 6-10a6 6 0 1 0-12 0c0 2.7 2 5.8 6 10z" />
      <circle cx="12" cy="11" r="2.25" />
    </Base>
  )
}

export function IconStudy(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M3 8.5 12 4l9 4.5-9 4.5z" />
      <path d="M7 11v4.5c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5V11" />
      <path d="M21 8.5v5" />
    </Base>
  )
}

export function IconCheck(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </Base>
  )
}

export function IconClose(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
    </Base>
  )
}

export function IconChevronRight(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M9.5 5.5 16 12l-6.5 6.5" />
    </Base>
  )
}

export function IconChevronLeft(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M14.5 5.5 8 12l6.5 6.5" />
    </Base>
  )
}

export function IconPlus(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 5v14M5 12h14" />
    </Base>
  )
}

export function IconWarning(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 4.5 21 19.5H3z" />
      <path d="M12 10v4" />
      <circle cx="12" cy="16.75" r="0.9" fill="currentColor" stroke="none" />
    </Base>
  )
}

export function IconOffline(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M3 4.5 21 19.5" />
      <path d="M5 11.5a10 10 0 0 1 3.4-2.2M19 11.5a10 10 0 0 0-6.9-2.9" />
      <path d="M8.5 15a5.5 5.5 0 0 1 6.2-.8" />
      <circle cx="12" cy="18.5" r="0.9" fill="currentColor" stroke="none" />
    </Base>
  )
}

export function IconClock(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v5.2l3.2 1.8" />
    </Base>
  )
}

export function IconAlarm(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="12" cy="13" r="7.5" />
      <path d="M12 9.5V13l2.5 1.5" />
      <path d="M4.5 5.5 7 3.5M19.5 5.5 17 3.5" />
    </Base>
  )
}

export function IconSettings(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v2M12 18.5v2M20.5 12h-2M5.5 12h-2M18 6l-1.4 1.4M7.4 16.6 6 18M18 18l-1.4-1.4M7.4 7.4 6 6" />
    </Base>
  )
}

export function IconSparkleSmall(props: IconProps) {
  return (
    <Base strokeWidth={2} {...props}>
      <path d="M12 4.5l1.1 3.6a3 3 0 0 0 1.8 1.8l3.6 1.1-3.6 1.1a3 3 0 0 0-1.8 1.8L12 17.5l-1.1-3.6a3 3 0 0 0-1.8-1.8L5.5 11l3.6-1.1a3 3 0 0 0 1.8-1.8z" />
    </Base>
  )
}

export function IconRefresh(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M20 12a8 8 0 1 1-2.6-5.9" />
      <path d="M20 4.5V10h-5.5" />
    </Base>
  )
}
