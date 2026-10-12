'use client'

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { spring, transition } from '@/design/motion'
import { IconInfo } from './icon'

/**
 * The (i) beside a feature, holding the instructions the screen itself no
 * longer spells out.
 *
 * The redesign keeps screens to icons and a few words; the explanation still
 * exists, it has just moved one gesture away. Every way of asking opens it:
 *
 *   - hover, with a fine pointer
 *   - press and hold, on touch — the gesture the brief asked for
 *   - a plain tap, because nobody discovers press-and-hold on their own
 *   - focus, from the keyboard
 *
 * It closes on a tap anywhere else, on Escape, on scroll, and on pointer-leave
 * when it was opened by hover. The bubble is `position: fixed` and placed from
 * the trigger's rect, so a list with `overflow: hidden` cannot clip it.
 */
export function InfoTip({
  title,
  children,
  label,
  size = 18,
}: {
  /** A two- or three-word heading inside the bubble. Optional. */
  title?: string
  /** The instructions. A sentence or two — more than that belongs on a page. */
  children: ReactNode
  /** What the button announces. Defaults to "About" plus the title. */
  label?: string
  size?: number
}) {
  const id = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const bubbleRef = useRef<HTMLSpanElement>(null)
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<{
    top: number
    left: number
    below: boolean
  } | null>(null)
  const openedBy = useRef<'hover' | 'press' | 'press-settled' | null>(null)
  const holdTimer = useRef<number | null>(null)
  const hoverTimer = useRef<number | null>(null)

  const close = useCallback(() => {
    setOpen(false)
    openedBy.current = null
  }, [])

  /* Placed above the trigger when there is room, below when there is not, and
   * clamped so it never runs off either side of a phone screen. */
  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !bubbleRef.current) return
    const trigger = triggerRef.current.getBoundingClientRect()
    const bubble = bubbleRef.current.getBoundingClientRect()
    const margin = 16
    const gap = 10
    const below = trigger.top - bubble.height - gap < margin
    const top = below ? trigger.bottom + gap : trigger.top - bubble.height - gap
    const centred = trigger.left + trigger.width / 2 - bubble.width / 2
    const left = Math.min(Math.max(centred, margin), window.innerWidth - bubble.width - margin)
    setPosition({ top, left, below })
  }, [open])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (triggerRef.current?.contains(target) || bubbleRef.current?.contains(target)) return
      close()
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close()
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', close, { passive: true })
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', close)
    }
  }, [open, close])

  useEffect(
    () => () => {
      if (holdTimer.current) window.clearTimeout(holdTimer.current)
      if (hoverTimer.current) window.clearTimeout(hoverTimer.current)
    },
    [],
  )

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="info-tip-trigger"
        aria-label={label ?? (title ? `About ${title}` : 'More information')}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onPointerEnter={(event) => {
          if (event.pointerType !== 'mouse') return
          hoverTimer.current = window.setTimeout(() => {
            openedBy.current = 'hover'
            setOpen(true)
          }, 120)
        }}
        onPointerLeave={(event) => {
          if (event.pointerType !== 'mouse') return
          if (hoverTimer.current) window.clearTimeout(hoverTimer.current)
          if (openedBy.current === 'hover') close()
        }}
        onPointerDown={(event) => {
          if (event.pointerType === 'mouse') return
          // Holding opens it without waiting for release; the click that
          // follows is then swallowed so it does not toggle straight back.
          holdTimer.current = window.setTimeout(() => {
            openedBy.current = 'press'
            setOpen(true)
            if ('vibrate' in navigator) navigator.vibrate?.(8)
          }, 280)
        }}
        onPointerUp={() => {
          if (holdTimer.current) window.clearTimeout(holdTimer.current)
        }}
        onPointerCancel={() => {
          if (holdTimer.current) window.clearTimeout(holdTimer.current)
        }}
        onContextMenu={(event) => event.preventDefault()}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          if (openedBy.current === 'press') {
            openedBy.current = 'press-settled'
            return
          }
          if (open) close()
          else {
            openedBy.current = 'press'
            setOpen(true)
          }
        }}
        onFocus={(event) => {
          if (event.currentTarget.matches(':focus-visible')) {
            openedBy.current = 'press'
            setOpen(true)
          }
        }}
        onBlur={() => {
          if (openedBy.current !== 'hover') close()
        }}
      >
        <IconInfo size={size} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.span
            ref={bubbleRef}
            id={id}
            role="tooltip"
            className="info-tip"
            style={{
              top: position?.top ?? -9999,
              left: position?.left ?? -9999,
              transformOrigin: position?.below ? 'top center' : 'bottom center',
            }}
            initial={{ opacity: 0, scale: 0.92, y: position?.below ? -4 : 4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={transition(spring.snap)}
          >
            {title && <strong>{title}</strong>}
            {children}
          </motion.span>
        )}
      </AnimatePresence>
    </>
  )
}
