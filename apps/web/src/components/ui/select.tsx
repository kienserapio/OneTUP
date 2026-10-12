'use client'

import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react'
import { cx } from '@/lib/cx'
import { IconCheck, IconChevronDown } from './icon'
import { PickerPanel } from './picker-panel'

/**
 * The app's dropdown, in place of the native <select>.
 *
 * The native one opens the operating system's picker, which on Windows is a
 * grey 2003 list and on Android a full-screen dialog — neither of which looks
 * like anything else here. This one is the same field the text inputs are,
 * opening a list that can carry an icon and a line of detail per option.
 *
 * It behaves like a select: a combobox trigger, a listbox with an active
 * descendant, arrows and Home/End to move, Enter or Space to choose, letters
 * to jump, Escape to back out. An option whose value is '' is the empty
 * choice, and shows as a placeholder when chosen. With `name`, a hidden input
 * carries the value into a plain form post.
 */

export interface SelectOption {
  value: string
  label: string
  description?: string
  icon?: ReactNode
  disabled?: boolean
}

export interface SelectGroup {
  label: string
  options: SelectOption[]
}

export interface SelectProps {
  id?: string
  name?: string
  value?: string
  defaultValue?: string
  onChange?: (value: string) => void
  options: (SelectOption | SelectGroup)[]
  /** Shown when nothing is chosen and no '' option names the empty choice. */
  placeholder?: string
  disabled?: boolean
  required?: boolean
  className?: string
  /**
   * `field` is the filled well every input uses. `bare` is just the value,
   * for a select sitting inside a control that is already its own field.
   */
  variant?: 'field' | 'bare'
  /** Titles the list when it opens as a sheet on a phone. */
  label?: string
  'aria-label'?: string
  'aria-labelledby'?: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean | 'true' | 'false'
}

function isGroup(entry: SelectOption | SelectGroup): entry is SelectGroup {
  return 'options' in entry
}

export function Select({
  id,
  name,
  value,
  defaultValue,
  onChange,
  options,
  placeholder = 'Choose…',
  disabled,
  required,
  className,
  variant = 'field',
  label,
  ...aria
}: SelectProps) {
  const autoId = useId()
  const triggerId = id ?? `select-${autoId}`
  const listId = `${triggerId}-list`

  const [inner, setInner] = useState(defaultValue ?? '')
  const current = value ?? inner

  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null)
  const [active, setActive] = useState(-1)
  const listRef = useRef<HTMLUListElement>(null)
  const typeahead = useRef({ text: '', at: 0 })

  const flat = options.flatMap((entry) => (isGroup(entry) ? entry.options : [entry]))
  const chosen = flat.find((option) => option.value === current)
  const empty = !chosen || chosen.value === ''

  const choose = (option: SelectOption) => {
    if (option.disabled) return
    if (value === undefined) setInner(option.value)
    if (option.value !== current) onChange?.(option.value)
  }

  const openList = (element: HTMLButtonElement, at?: number) => {
    if (disabled) return
    setAnchor(element)
    const selected = flat.findIndex((option) => option.value === current)
    setActive(at ?? (selected >= 0 ? selected : firstEnabled(flat, 0, 1)))
    setOpen(true)
  }

  const close = () => setOpen(false)

  // The list takes focus as it opens, so the keyboard lands in it rather than
  // staying on the field behind it.
  useEffect(() => {
    if (open) listRef.current?.focus({ preventScroll: true })
  }, [open])

  useEffect(() => {
    if (!open || active < 0) return
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [open, active])

  /** Letters jump to the next option starting with what has been typed. */
  const match = (key: string, from: number, now: number): number => {
    const state = typeahead.current
    state.text = now - state.at > 600 ? key : state.text + key
    state.at = now
    const needle = state.text.toLowerCase()
    for (let step = 0; step < flat.length; step++) {
      const index = (from + step + (state.text.length === 1 ? 1 : 0)) % flat.length
      const option = flat[index]
      if (!option.disabled && option.label.toLowerCase().startsWith(needle)) return index
    }
    return -1
  }

  const onTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
      event.preventDefault()
      openList(event.currentTarget)
      return
    }
    if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      const index = match(
        event.key,
        Math.max(0, flat.indexOf(chosen as SelectOption)),
        event.timeStamp,
      )
      if (index >= 0) choose(flat[index])
    }
  }

  const onListKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    const move = (index: number) => {
      event.preventDefault()
      if (index >= 0) setActive(index)
    }
    switch (event.key) {
      case 'ArrowDown':
        return move(firstEnabled(flat, active + 1, 1))
      case 'ArrowUp':
        return move(firstEnabled(flat, active - 1, -1))
      case 'Home':
        return move(firstEnabled(flat, 0, 1))
      case 'End':
        return move(firstEnabled(flat, flat.length - 1, -1))
      case 'Enter':
      case ' ':
        event.preventDefault()
        if (flat[active]) choose(flat[active])
        close()
        return
      case 'Tab':
        // Like the native control: Tab leaves the list, and moves on from the
        // field rather than wandering into the page behind the popover.
        event.preventDefault()
        event.stopPropagation()
        close()
        return
      default:
        if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
          move(match(event.key, Math.max(active, 0), event.timeStamp))
        }
    }
  }

  const renderOption = (option: SelectOption) => {
    const at = flat.indexOf(option)
    const selected = option.value === current
    return (
      <li
        key={`${option.value}-${at}`}
        id={`${listId}-${at}`}
        data-index={at}
        role="option"
        aria-selected={selected}
        aria-disabled={option.disabled || undefined}
        data-active={at === active || undefined}
        className="select-option"
        onPointerMove={() => !option.disabled && at !== active && setActive(at)}
        onClick={(event: MouseEvent) => {
          event.preventDefault()
          if (option.disabled) return
          choose(option)
          close()
        }}
      >
        {option.icon && <span className="shrink-0">{option.icon}</span>}
        <span className="min-w-0 flex-1">
          <span className="block truncate">{option.label}</span>
          {option.description && (
            <span className="select-option-detail block truncate">{option.description}</span>
          )}
        </span>
        <IconCheck size={18} className="select-option-check shrink-0" aria-hidden />
      </li>
    )
  }

  return (
    <>
      <button
        type="button"
        id={triggerId}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-required={required || undefined}
        aria-label={aria['aria-label']}
        aria-labelledby={aria['aria-labelledby']}
        aria-describedby={aria['aria-describedby']}
        aria-invalid={aria['aria-invalid']}
        disabled={disabled}
        data-open={open || undefined}
        className={cx(
          'picker-trigger',
          variant === 'field' ? 'field' : 'picker-trigger-bare',
          className,
        )}
        onClick={(event) => (open ? close() : openList(event.currentTarget))}
        onKeyDown={onTriggerKeyDown}
      >
        {chosen?.icon && !empty && <span className="shrink-0">{chosen.icon}</span>}
        <span className={cx('min-w-0 flex-1 truncate text-left', empty && 'picker-placeholder')}>
          {chosen ? chosen.label : placeholder}
        </span>
        {variant === 'field' && (
          <IconChevronDown size={18} className="picker-chevron shrink-0" aria-hidden />
        )}
      </button>

      {name && <input type="hidden" name={name} value={current} />}

      <PickerPanel
        open={open}
        anchor={anchor}
        onClose={close}
        label={label ?? aria['aria-label'] ?? placeholder}
        minWidth={200}
      >
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          tabIndex={0}
          aria-labelledby={triggerId}
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          className="select-list"
          onKeyDown={onListKeyDown}
        >
          {options.map((entry) =>
            isGroup(entry) ? (
              <li key={`group-${entry.label}`} role="presentation">
                <p className="select-group-label" aria-hidden>
                  {entry.label}
                </p>
                <ul role="group" aria-label={entry.label}>
                  {entry.options.map(renderOption)}
                </ul>
              </li>
            ) : (
              renderOption(entry)
            ),
          )}
        </ul>
      </PickerPanel>
    </>
  )
}

/** The nearest option at or past `from` in `direction` that can be chosen. */
function firstEnabled(options: SelectOption[], from: number, direction: 1 | -1): number {
  for (let index = from; index >= 0 && index < options.length; index += direction) {
    if (!options[index].disabled) return index
  }
  return -1
}
