'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { spring, transition } from '@/design/motion'
import { cx } from '@/lib/cx'
import { IconCheck, IconChevronRight } from '@/components/ui/icon'
import { CATEGORY_LABEL } from './place-list'

/**
 * "Jump to" — one control, not a wall of buttons.
 *
 * A campus has more places than fit on a phone screen, so the list of them is
 * something you open, search and dismiss rather than something that permanently
 * covers the thing you came to look at.
 *
 * It is a combobox with a listbox popup, built by hand rather than as a native
 * `<select>` for one reason: the search field. Below about a dozen scenes a
 * native picker would be better; above it, scrolling a wheel to find "Ayuntamiento"
 * is worse than typing three letters.
 *
 * Keyboard contract, which is the part that has to be right:
 *   Enter / Space   open (the trigger is a real button, so this is free)
 *   ArrowDown       open from the trigger, or move down inside the list
 *   ArrowUp/Home/End move within the list
 *   Enter           choose the active option
 *   Escape          close and put focus back on the trigger
 *   Tab             close and carry on out of the control
 *
 * Focus never leaves the search field while the popup is open; the active
 * option is announced through `aria-activedescendant`, which is what lets one
 * field both filter and navigate.
 */

export interface SceneOption {
  /** `campus_places.id` */
  id: string
  name: string
  category: string
  /** `campus_places.tour_scene_url` */
  scene: string
}

export function ScenePicker({
  options,
  value,
  onChange,
  className,
}: {
  options: SceneOption[]
  value: string | null
  onChange: (scene: string) => void
  className?: string
}) {
  const baseId = useId()
  const listId = `${baseId}-list`
  const optionId = useCallback((index: number) => `${baseId}-option-${index}`, [baseId])

  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)

  const current = options.find((option) => option.scene === value) ?? null

  /* Places arrive ordered by category then name, so grouping by insertion order
   * keeps the headings in the same order the database chose. */
  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const matches = needle
      ? options.filter((option) =>
          `${option.name} ${CATEGORY_LABEL[option.category] ?? option.category}`
            .toLowerCase()
            .includes(needle),
        )
      : options

    const byCategory = new Map<string, SceneOption[]>()
    for (const option of matches) {
      const bucket = byCategory.get(option.category)
      if (bucket) bucket.push(option)
      else byCategory.set(option.category, [option])
    }
    return [...byCategory.entries()]
  }, [options, query])

  /** The same options in the order a down-arrow walks them. */
  const flat = useMemo(() => groups.flatMap(([, items]) => items), [groups])

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false)
    setQuery('')
    if (returnFocus) triggerRef.current?.focus()
  }, [])

  function openFrom(index: number) {
    setQuery('')
    setActiveIndex(index)
    setOpen(true)
  }

  function select(option: SceneOption) {
    onChange(option.scene)
    close(true)
  }

  // Typing narrows the list, so the highlight goes back to the top rather than
  // pointing at whatever happens to sit at the old index.
  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    document.getElementById(optionId(activeIndex))?.scrollIntoView({ block: 'nearest' })
  }, [open, activeIndex, optionId])

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) close(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open, close])

  function onFieldKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        setActiveIndex((index) => Math.min(index + 1, flat.length - 1))
        break
      case 'ArrowUp':
        event.preventDefault()
        setActiveIndex((index) => Math.max(index - 1, 0))
        break
      case 'Home':
        event.preventDefault()
        setActiveIndex(0)
        break
      case 'End':
        event.preventDefault()
        setActiveIndex(Math.max(0, flat.length - 1))
        break
      case 'Enter': {
        event.preventDefault()
        const option = flat[activeIndex]
        if (option) select(option)
        break
      }
      case 'Escape':
        event.preventDefault()
        close(true)
        break
      case 'Tab':
        close(false)
        break
      default:
        break
    }
  }

  if (options.length === 0) return null

  return (
    <div ref={rootRef} className={cx('relative', className)}>
      <button
        ref={triggerRef}
        type="button"
        /* 56vw, not 72: the row also carries the way back out, and at 390px the
         * old ceiling pushed this pill off the right edge of the screen. */
        className="glass max-w-[min(18rem,56vw)]"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => (open ? close(false) : openFrom(Math.max(0, flat.findIndex((option) => option.scene === value))))}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && !open) {
            event.preventDefault()
            openFrom(Math.max(0, flat.findIndex((option) => option.scene === value)))
          }
        }}
      >
        <span className="type-subheadline shrink-0 font-semibold">Jump to</span>
        {current && (
          <span
            className="type-footnote hidden truncate font-normal sm:inline"
            style={{ color: 'var(--label-secondary)' }}
          >
            {current.name}
          </span>
        )}
        <IconChevronRight
          size={16}
          className="shrink-0"
          style={{
            transform: open ? 'rotate(-90deg)' : 'rotate(90deg)',
            transition: 'transform var(--duration-fast) var(--ease-standard)',
            color: 'var(--label-secondary)',
          }}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="card squircle absolute right-0 z-30 overflow-hidden"
            style={{
              top: 'calc(100% + var(--space-2))',
              width: 'min(22rem, calc(100vw - var(--space-6)))',
              boxShadow: 'var(--shadow-float)',
              background: 'var(--bg-grouped-secondary)',
            }}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={transition(spring.snap)}
          >
            <div
              className="p-[var(--space-2)]"
              style={{ borderBottom: '1px solid var(--separator)' }}
            >
              <input
                ref={inputRef}
                type="text"
                role="combobox"
                className="field"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={onFieldKeyDown}
                placeholder="Search the campus"
                aria-label="Search places in the tour"
                aria-expanded
                aria-controls={flat.length > 0 ? listId : undefined}
                aria-autocomplete="list"
                aria-activedescendant={flat[activeIndex] ? optionId(activeIndex) : undefined}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="go"
              />
            </div>

            {flat.length > 0 ? (
              <div
                id={listId}
                role="listbox"
                aria-label="Places in the tour"
                className="overflow-y-auto overscroll-contain"
                style={{ maxHeight: 'min(46dvh, 20rem)' }}
              >
                {groups.map(([category, items]) => {
                  const headingId = `${baseId}-group-${category}`
                  return (
                    <div key={category} role="group" aria-labelledby={headingId}>
                      <p
                        id={headingId}
                        className="type-caption-1 sticky top-0 px-[var(--space-4)] py-[var(--space-1)] font-semibold uppercase"
                        style={{
                          background: 'var(--bg-grouped-secondary)',
                          color: 'var(--label-secondary)',
                          letterSpacing: '0.06em',
                        }}
                      >
                        {CATEGORY_LABEL[category] ?? category}
                      </p>
                      {items.map((option) => {
                        const index = flat.indexOf(option)
                        const isActive = index === activeIndex
                        const isSelected = option.scene === value
                        return (
                          <div
                            key={option.id}
                            id={optionId(index)}
                            role="option"
                            aria-selected={isSelected}
                            onClick={() => select(option)}
                            onPointerMove={() => setActiveIndex(index)}
                            className="flex cursor-pointer items-center gap-[var(--space-2)] px-[var(--space-4)]"
                            style={{
                              minHeight: 'var(--target-min)',
                              background: isActive ? 'var(--fill-quaternary)' : undefined,
                              color: isSelected ? 'var(--accent)' : 'var(--label)',
                            }}
                          >
                            <span className="type-body min-w-0 flex-1 truncate">{option.name}</span>
                            {isSelected && <IconCheck size={17} className="shrink-0" />}
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="type-subheadline p-[var(--space-4)]" style={{ color: 'var(--label-secondary)' }}>
                Nothing in the tour matches that. Only places somebody has linked to a 360°
                scene show up here.
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
