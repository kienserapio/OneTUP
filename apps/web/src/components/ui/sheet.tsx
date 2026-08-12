'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion, useMotionValue, useTransform } from 'motion/react'
import { DRAG_THRESHOLD_PX, rubberband, shouldCommit, spring, transition } from '@/design/motion'
import { cx } from '@/lib/cx'
import { IconClose } from './icon'

/**
 * A bottom sheet that can be grabbed at any point in its motion.
 *
 * The whole point of the implementation is interruptibility. The sheet tracks
 * the finger one-to-one, resists past its top edge instead of stopping dead,
 * and decides on release by the *sign of the velocity* rather than by how far
 * it travelled — a student who flicks it down has said "dismiss", even at 20%.
 *
 * It is deliberately not a CSS transition. A transition cannot be grabbed and
 * reversed mid-flight, which is exactly what a sheet has to survive.
 */

export interface SheetProps {
  open: boolean
  onClose: () => void
  title?: string
  /** A modal task dims the background; a parallel one does not break the flow. */
  modal?: boolean
  /**
   * Glass by default, because most sheets here are an extension of the screen
   * behind them and the translucency says so. `solid` is for the ones that are
   * a different context altogether — navigation, most of all: a menu read
   * against whatever page you happened to be on is a menu you have to squint
   * at, and the page underneath is not information you need while choosing.
   */
  surface?: 'material' | 'solid'
  children: ReactNode
  footer?: ReactNode
}

export function Sheet({
  open,
  onClose,
  title,
  modal = true,
  surface = 'material',
  children,
  footer,
}: SheetProps) {
  const y = useMotionValue(0)
  const [height, setHeight] = useState(0)
  const panelRef = useRef<HTMLDivElement>(null)

  // The scrim tracks the drag, so pulling the sheet down brightens the page
  // underneath continuously rather than only at the end.
  const scrimOpacity = useTransform(y, [0, Math.max(height, 1)], [1, 0])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)

    const previousOverflow = document.body.style.overflow
    if (modal) document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
    }
  }, [open, onClose, modal])

  useEffect(() => {
    if (open && panelRef.current) setHeight(panelRef.current.offsetHeight)
  }, [open, children])

  return (
    <AnimatePresence>
      {open && (
        <>
          {modal && (
            <motion.div
              className="fixed inset-0 z-50 bg-black/35"
              style={{ opacity: scrimOpacity }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onPointerDown={onClose}
              aria-hidden
            />
          )}

          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal={modal}
            aria-label={title}
            className={cx(
              'sheet fixed inset-x-0 bottom-0 z-50',
              surface === 'material' && 'material material-large',
              'mx-auto flex max-h-[88dvh] w-full max-w-[34rem] flex-col',
            )}
            style={{
              y,
              borderRadius: 'var(--radius-sheet) var(--radius-sheet) 0 0',
              boxShadow: 'var(--shadow-sheet)',
              paddingBottom: 'env(safe-area-inset-bottom)',
              ...(surface === 'solid'
                ? { background: 'var(--bg)', borderTop: '1px solid var(--separator)' }
                : null),
            }}
            // Enters and exits along the same path — a sheet that arrives from
            // below and leaves sideways reads as two different objects.
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={transition(spring.sheet)}
            drag="y"
            dragDirectionLock
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{
              top: 0.04, // Resistance upward: there is nothing above to reach.
              bottom: 0.9,
            }}
            onDragEnd={(_, info) => {
              if (shouldCommit(info.offset.y / Math.max(height, 1), info.velocity.y)) {
                onClose()
              }
            }}
          >
            <Grabber />

            {title && (
              <header className="flex items-center justify-between gap-3 px-5 pb-3">
                <h2 className="type-title-3">{title}</h2>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="grid size-8 place-items-center rounded-full text-[var(--label-secondary)]"
                  style={{ background: 'var(--fill-tertiary)' }}
                >
                  <IconClose size={18} />
                </button>
              </header>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5">
              {children}
            </div>

            {footer && (
              <div
                className="px-5 pb-5 pt-3"
                style={{ boxShadow: 'inset 0 1px 0 0 var(--separator)' }}
              >
                {footer}
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

function Grabber() {
  return (
    <div className="flex justify-center pb-1 pt-2.5" aria-hidden>
      <span
        className="h-[5px] w-9 rounded-full"
        style={{ background: 'var(--label-quaternary)' }}
      />
    </div>
  )
}

/**
 * A one-to-one draggable surface, for cases the sheet does not cover.
 *
 * Kept as a hook rather than a component because the interesting part is the
 * tracking, not the markup: pointer capture so the drag survives leaving the
 * element, the grab offset preserved so the element does not jump to centre,
 * and rubber-banding past the bounds.
 */
export function useDraggable({
  axis = 'y',
  bounds,
  onRelease,
}: {
  axis?: 'x' | 'y'
  bounds?: { min: number; max: number }
  onRelease?: (offset: number, velocity: number) => void
} = {}) {
  const [offset, setOffset] = useState(0)
  const state = useRef({ active: false, start: 0, origin: 0, lastTime: 0, lastValue: 0, velocity: 0 })

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId)
      const point = axis === 'y' ? event.clientY : event.clientX
      state.current = {
        active: true,
        start: point,
        origin: offset,
        lastTime: event.timeStamp,
        lastValue: point,
        velocity: 0,
      }
    },
    [axis, offset],
  )

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (!state.current.active) return
      const point = axis === 'y' ? event.clientY : event.clientX
      const delta = point - state.current.start
      if (Math.abs(delta) < DRAG_THRESHOLD_PX && offset === state.current.origin) return

      let next = state.current.origin + delta
      if (bounds) {
        const span = bounds.max - bounds.min
        if (next < bounds.min) next = bounds.min - rubberband(bounds.min - next, span)
        if (next > bounds.max) next = bounds.max + rubberband(next - bounds.max, span)
      }

      const elapsed = event.timeStamp - state.current.lastTime
      if (elapsed > 0) {
        state.current.velocity = ((point - state.current.lastValue) / elapsed) * 1000
        state.current.lastTime = event.timeStamp
        state.current.lastValue = point
      }

      setOffset(next)
    },
    [axis, bounds, offset],
  )

  const onPointerUp = useCallback(() => {
    if (!state.current.active) return
    state.current.active = false
    onRelease?.(offset, state.current.velocity)
  }, [offset, onRelease])

  return {
    offset,
    setOffset,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp },
  }
}
