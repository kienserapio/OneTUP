'use client'

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { cx } from '@/lib/cx'
import { IconChevronDown, IconClock } from './icon'
import { PickerPanel } from './picker-panel'

/**
 * The app's time field, in place of <input type="time">.
 *
 * Three short columns — hour, minute, AM/PM — rather than a text box that
 * wants a keyboard, in steps of five because nothing at school starts at
 * 7:03. A value off the step (an imported 7:03, say) is still shown and kept.
 * The value stays the 24-hour 'HH:MM' string the native input produced.
 */

export interface TimePickerProps {
  id?: string
  name?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  /** Minutes between choices. */
  step?: number
  disabled?: boolean
  required?: boolean
  className?: string
  clearable?: boolean
  label?: string
  'aria-label'?: string
  'aria-invalid'?: boolean | 'true' | 'false'
  'aria-describedby'?: string
}

interface Parts {
  hour: number // 1–12
  minute: number
  pm: boolean
}

function toParts(value: string): Parts | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(value)
  if (!match) return null
  const h = Number(match[1])
  return { hour: h % 12 === 0 ? 12 : h % 12, minute: Number(match[2]), pm: h >= 12 }
}

function fromParts({ hour, minute, pm }: Parts): string {
  const h = (hour % 12) + (pm ? 12 : 0)
  return `${String(h).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

/** "7:30 AM". */
export function formatFriendlyTime(value: string): string {
  const parts = toParts(value)
  if (!parts) return ''
  return `${parts.hour}:${String(parts.minute).padStart(2, '0')} ${parts.pm ? 'PM' : 'AM'}`
}

const HOURS = Array.from({ length: 12 }, (_, index) => index + 1)

export function TimePicker({
  id,
  name,
  value,
  onChange,
  placeholder = 'Pick a time',
  step = 5,
  disabled,
  required,
  className,
  clearable,
  label,
  ...aria
}: TimePickerProps) {
  const autoId = useId()
  const triggerId = id ?? `time-${autoId}`

  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const parts = toParts(value)
  // Nothing chosen yet: the columns start at the first class of the day.
  const shown: Parts = parts ?? { hour: 7, minute: 0, pm: false }

  const minutes = Array.from({ length: Math.ceil(60 / step) }, (_, index) => index * step)
  if (!minutes.includes(shown.minute)) {
    minutes.push(shown.minute)
    minutes.sort((a, b) => a - b)
  }

  const set = (patch: Partial<Parts>) => onChange(fromParts({ ...shown, ...patch }))

  const openPanel = (element: HTMLButtonElement) => {
    if (disabled) return
    setAnchor(element)
    setOpen(true)
  }
  const close = () => setOpen(false)

  // Each column scrolls its choice to the middle as the panel opens, and the
  // hour column takes the keyboard.
  useEffect(() => {
    if (!open) return
    const frame = requestAnimationFrame(() => {
      panelRef.current
        ?.querySelectorAll<HTMLElement>('[aria-selected="true"]')
        .forEach((option) => option.scrollIntoView({ block: 'center' }))
      panelRef.current?.querySelector<HTMLElement>('[role="listbox"]')?.focus({
        preventScroll: true,
      })
    })
    return () => cancelAnimationFrame(frame)
  }, [open])

  const display = formatFriendlyTime(value)

  return (
    <>
      <button
        type="button"
        id={triggerId}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-required={required || undefined}
        data-invalid={aria['aria-invalid'] === true || aria['aria-invalid'] === 'true' || undefined}
        aria-describedby={aria['aria-describedby']}
        aria-label={
          aria['aria-label'] ? `${aria['aria-label']}${display ? `, ${display}` : ''}` : undefined
        }
        disabled={disabled}
        data-open={open || undefined}
        className={cx('picker-trigger field', className)}
        onClick={(event) => (open ? close() : openPanel(event.currentTarget))}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            openPanel(event.currentTarget)
          }
        }}
      >
        <IconClock size={18} className="picker-lead shrink-0" aria-hidden />
        <span className={cx('min-w-0 flex-1 truncate text-left', !display && 'picker-placeholder')}>
          {display || placeholder}
        </span>
        <IconChevronDown size={18} className="picker-chevron shrink-0" aria-hidden />
      </button>

      {name && <input type="hidden" name={name} value={value} />}

      <PickerPanel
        open={open}
        anchor={anchor}
        onClose={close}
        label={label ?? aria['aria-label'] ?? 'Choose a time'}
        minWidth={260}
        footer={
          <div className="flex items-center gap-2">
            {clearable && value && (
              <button
                type="button"
                className="picker-chip picker-chip-quiet"
                onClick={() => {
                  onChange('')
                  close()
                }}
              >
                Clear
              </button>
            )}
            <button type="button" className="picker-done ml-auto" onClick={close}>
              Done
            </button>
          </div>
        }
      >
        <div ref={panelRef} className="time-columns">
          <Column
            label="Hour"
            items={HOURS}
            selected={parts ? shown.hour : null}
            render={(hour) => String(hour)}
            onPick={(hour) => set({ hour })}
          />
          <span className="time-colon" aria-hidden>
            :
          </span>
          <Column
            label="Minute"
            items={minutes}
            selected={parts ? shown.minute : null}
            render={(minute) => String(minute).padStart(2, '0')}
            onPick={(minute) => set({ minute })}
          />
          <Column
            label="AM or PM"
            items={[false, true]}
            selected={parts ? shown.pm : null}
            render={(pm) => (pm ? 'PM' : 'AM')}
            onPick={(pm) => set({ pm })}
            short
          />
        </div>
      </PickerPanel>
    </>
  )
}

function Column<T extends number | boolean>({
  label,
  items,
  selected,
  render,
  onPick,
  short,
}: {
  label: string
  items: T[]
  selected: T | null
  render: (item: T) => string
  onPick: (item: T) => void
  short?: boolean
}) {
  const index = selected === null ? -1 : items.indexOf(selected)

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const next =
      event.key === 'ArrowDown'
        ? Math.min(items.length - 1, index + 1)
        : event.key === 'ArrowUp'
          ? Math.max(0, index - 1)
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? items.length - 1
              : null
    if (next === null) return
    event.preventDefault()
    onPick(items[next])
    event.currentTarget
      .querySelector<HTMLElement>(`[data-index="${next}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }

  return (
    <div
      role="listbox"
      tabIndex={0}
      aria-label={label}
      className={cx('time-column', short && 'time-column-short')}
      onKeyDown={onKeyDown}
    >
      {items.map((item, at) => (
        <button
          key={String(item)}
          type="button"
          role="option"
          tabIndex={-1}
          data-index={at}
          aria-selected={at === index}
          className="time-option"
          onClick={() => onPick(item)}
        >
          {render(item)}
        </button>
      ))}
    </div>
  )
}
