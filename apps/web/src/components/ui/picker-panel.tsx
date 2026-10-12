'use client'

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { spring, transition } from '@/design/motion'

/**
 * The surface every custom picker opens into — the select's list, the
 * calendar, the time wheel.
 *
 * On a desktop it is a popover anchored under its field, flipping above when
 * the field is near the bottom of the window. On a phone it is a sheet from
 * the bottom edge instead, because a popover under a field a thumb just
 * tapped is a popover under that thumb.
 *
 * It renders into the nearest `.app-ui` rather than into <body>, so the
 * theme's tokens and font still apply, and above the app's own sheets, so a
 * picker opened from inside one sits on top of it.
 */

const COMPACT_QUERY = '(max-width: 640px)'

function subscribeCompact(onChange: () => void) {
  const media = window.matchMedia(COMPACT_QUERY)
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}

/** True on a phone-width screen, where pickers open as a bottom sheet. */
export function useCompact(): boolean {
  return useSyncExternalStore(
    subscribeCompact,
    () => window.matchMedia(COMPACT_QUERY).matches,
    () => false,
  )
}

const GAP = 8
const EDGE = 12

export function PickerPanel({
  open,
  anchor,
  onClose,
  label,
  minWidth = 0,
  children,
  footer,
}: {
  open: boolean
  /** The field the panel belongs to. Captured when it opens. */
  anchor: HTMLElement | null
  onClose: () => void
  /** Names the panel for assistive tech, and titles it on a phone. */
  label: string
  minWidth?: number
  children: ReactNode
  footer?: ReactNode
}) {
  const compact = useCompact()
  const panelRef = useRef<HTMLDivElement>(null)

  // Placement is written straight to the element rather than through state:
  // it follows every scroll and resize, and a re-render per scroll event is
  // exactly the jank a picker should not have.
  useLayoutEffect(() => {
    if (!open || compact || !anchor) return
    const place = () => {
      const panel = panelRef.current
      if (!panel) return
      const rect = anchor.getBoundingClientRect()
      const width = Math.max(rect.width, minWidth)
      const height = panel.offsetHeight
      const below = window.innerHeight - rect.bottom - GAP - EDGE
      const top =
        below >= height || rect.top < height + GAP + EDGE
          ? rect.bottom + GAP
          : rect.top - GAP - height
      const left = Math.min(Math.max(rect.left, EDGE), window.innerWidth - width - EDGE)
      panel.style.top = `${Math.max(top, EDGE)}px`
      panel.style.left = `${left}px`
      panel.style.width = `${width}px`
      panel.style.transformOrigin = top < rect.top ? 'bottom center' : 'top center'
    }
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open, compact, anchor, minWidth])

  // A press anywhere else closes it — except on the field itself, which
  // toggles it on its own.
  useEffect(() => {
    if (!open || compact) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (panelRef.current?.contains(target) || anchor?.contains(target)) return
      onClose()
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open, compact, anchor, onClose])

  // Focus goes back to the field it came from, so the keyboard picks up where
  // it left off.
  useEffect(() => {
    if (!open) return
    return () => {
      if (anchor?.isConnected) anchor.focus({ preventScroll: true })
    }
  }, [open, anchor])

  // Escape and Tab stop here. Both would otherwise reach the document, where
  // a sheet this picker was opened from listens for them — and closing the
  // whole sheet to dismiss a dropdown is not what anyone pressed Escape for.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      event.preventDefault()
      onClose()
      return
    }
    if (event.key !== 'Tab') return
    event.stopPropagation()
    const focusable = [
      ...(panelRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]):not([tabindex="-1"]), [tabindex]:not([tabindex="-1"])',
      ) ?? []),
    ]
    if (focusable.length === 0) return
    const index = focusable.indexOf(document.activeElement as HTMLElement)
    const next = event.shiftKey
      ? focusable[(index - 1 + focusable.length) % focusable.length]
      : focusable[(index + 1) % focusable.length]
    event.preventDefault()
    next.focus()
  }

  // No anchor until the first open, which only ever happens in the browser —
  // so the server render and the first client render agree on nothing here.
  if (!anchor) return null
  const container = (anchor.closest('.app-ui') as HTMLElement | null) ?? document.body

  return createPortal(
    <AnimatePresence>
      {open &&
        (compact ? (
          <>
            <motion.div
              key="scrim"
              className="picker-scrim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onPointerDown={onClose}
              aria-hidden
            />
            <motion.div
              key="sheet"
              ref={panelRef}
              role="dialog"
              aria-label={label}
              className="picker-panel picker-sheet"
              onKeyDown={onKeyDown}
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={transition(spring.sheet)}
              drag="y"
              dragDirectionLock
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0.04, bottom: 0.9 }}
              onDragEnd={(_, info) => {
                if (info.offset.y > 80 || info.velocity.y > 500) onClose()
              }}
            >
              <div className="flex justify-center pb-1 pt-2.5" aria-hidden>
                <span className="h-[5px] w-9 rounded-full bg-[var(--label-quaternary)]" />
              </div>
              <p className="picker-sheet-title">{label}</p>
              <div className="picker-body">{children}</div>
              {footer && <div className="picker-footer">{footer}</div>}
            </motion.div>
          </>
        ) : (
          <motion.div
            key="popover"
            ref={panelRef}
            role="dialog"
            aria-label={label}
            className="picker-panel picker-popover"
            onKeyDown={onKeyDown}
            initial={{ opacity: 0, scale: 0.96, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -4, transition: { duration: 0.12 } }}
            transition={transition(spring.snap)}
          >
            <div className="picker-body">{children}</div>
            {footer && <div className="picker-footer">{footer}</div>}
          </motion.div>
        ))}
    </AnimatePresence>,
    container,
  )
}
