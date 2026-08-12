import type { SVGProps } from 'react'
import {
  IconAlarmFilled,
  IconAlertTriangleFilled,
  IconArrowNarrowRight,
  IconAwardFilled,
  IconBellFilled,
  IconBookFilled,
  IconBusFilled,
  IconCalendarFilled,
  IconCheckFilled,
  IconChevronDown as TablerChevronDown,
  IconChevronLeft as TablerChevronLeft,
  IconChevronRight as TablerChevronRight,
  IconClipboardCheckFilled,
  IconClockFilled,
  IconCoinFilled,
  IconCurrencyPeso,
  IconDotsFilled,
  IconFileTextFilled,
  IconLayoutGridFilled,
  IconLockFilled,
  IconLogout,
  IconMap2,
  IconMapPinFilled,
  IconPlusFilled,
  IconRefresh as TablerRefresh,
  IconRoute as TablerRoute,
  IconSchoolFilled,
  IconSearchFilled,
  IconSettingsFilled,
  IconShieldCheckFilled,
  IconSparklesFilled,
  IconSquareCheckFilled,
  IconTargetArrow,
  IconUpload,
  IconUserFilled,
  IconWalk as TablerWalk,
  IconWifiOff,
  IconX,
} from '@tabler/icons-react'

/**
 * Icons.
 *
 * Tabler's solid set, aliased behind the names this codebase already uses. The
 * indirection is the point: every screen imports `IconToday`, not
 * `IconClockFilled`, so swapping the underlying pack again is one file rather
 * than a hundred call sites — and the names stay about what the glyph *means*
 * here rather than what it happens to depict.
 *
 * Solid throughout, with one unavoidable exception: a chevron, an arrow or a
 * strike-through has no interior to fill, so those come from the outline set
 * and are drawn at a heavier stroke to sit alongside the filled ones without
 * looking thin.
 *
 * Every glyph inherits `currentColor`, which is what lets a tab item tint as
 * one piece.
 */

/** What Tabler's components actually accept, loosened where we do not care. */
type TablerGlyphProps = Omit<SVGProps<SVGSVGElement>, 'stroke'> & {
  size?: string | number
  stroke?: string | number
}

export type IconProps = Omit<SVGProps<SVGSVGElement>, 'stroke' | 'ref'> & {
  size?: number
  /** Kept for call sites written against the old hand-drawn set. Only affects
   * the line glyphs; a filled one has no stroke to widen. */
  strokeWidth?: number
}

/* Line glyphs need a heavier stroke than Tabler's default to hold their own
 * beside solid ones at 17–26px, which is most of where these are used. */
const LINE_STROKE = 2.25

function alias(Glyph: (props: TablerGlyphProps) => React.ReactNode) {
  return function Icon({ size = 24, strokeWidth, ...props }: IconProps) {
    return (
      <Glyph
        size={size}
        stroke={strokeWidth ?? LINE_STROKE}
        aria-hidden="true"
        focusable="false"
        {...props}
      />
    )
  }
}

/* --- Destinations -------------------------------------------------------- */

export const IconToday = alias(IconClockFilled)
export const IconSchedule = alias(IconCalendarFilled)
export const IconAsk = alias(IconSparklesFilled)
export const IconDeadlines = alias(IconClipboardCheckFilled)
export const IconSubjects = alias(IconBookFilled)
export const IconCommute = alias(IconBusFilled)
export const IconAnnouncement = alias(IconBellFilled)
export const IconCampus = alias(IconMapPinFilled)
export const IconStudy = alias(IconSchoolFilled)
export const IconGrades = alias(IconAwardFilled)
export const IconAttendance = alias(IconSquareCheckFilled)
export const IconSettings = alias(IconSettingsFilled)
export const IconDocs = alias(IconFileTextFilled)
export const IconMore = alias(IconDotsFilled)
export const IconProfile = alias(IconUserFilled)
export const IconOverview = alias(IconLayoutGridFilled)

/* --- Actions and states -------------------------------------------------- */

export const IconCheck = alias(IconCheckFilled)
export const IconClose = alias(IconX)
export const IconChevronRight = alias(TablerChevronRight)
export const IconChevronLeft = alias(TablerChevronLeft)
export const IconChevronDown = alias(TablerChevronDown)
export const IconArrow = alias(IconArrowNarrowRight)
export const IconPlus = alias(IconPlusFilled)
export const IconWarning = alias(IconAlertTriangleFilled)
export const IconOffline = alias(IconWifiOff)
export const IconClock = alias(IconClockFilled)
export const IconAlarm = alias(IconAlarmFilled)
export const IconSparkleSmall = alias(IconSparklesFilled)
export const IconRefresh = alias(TablerRefresh)
export const IconSearch = alias(IconSearchFilled)
export const IconSignOut = alias(IconLogout)

/* --- Marketing and trust ------------------------------------------------- */

export const IconMap = alias(IconMap2)
export const IconLock = alias(IconLockFilled)
export const IconShield = alias(IconShieldCheckFilled)
export const IconExport = alias(IconUpload)

/* --- Commute ------------------------------------------------------------- */

export const IconRoute = alias(TablerRoute)
export const IconWalk = alias(TablerWalk)
export const IconFare = alias(IconCurrencyPeso)
export const IconCoin = alias(IconCoinFilled)
export const IconTarget = alias(IconTargetArrow)
