'use client'

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { spring, transition } from '@/design/motion'
import {
  IconArrowUpward,
  IconAttendance,
  IconCommute,
  IconDeadlines,
  IconLanguage,
  IconPlus,
  IconSchedule,
  IconStop,
} from '@/components/ui/icon'

/**
 * The input.
 *
 * Every control on it does something: `+` starts a question about one part of
 * the app, the language chip tells the assistant which language to answer in, and send turns into stop while an answer is being worked out.
 */

export type Locale = 'auto' | 'en' | 'fil'

const LOCALES: { value: Locale; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'en', label: 'EN' },
  { value: 'fil', label: 'FIL' },
]

const STARTERS = [
  { label: 'My schedule', Icon: IconSchedule, text: 'Looking at my schedule, ' },
  { label: 'My deadlines', Icon: IconDeadlines, text: 'Looking at my deadlines, ' },
  { label: 'My cuts', Icon: IconAttendance, text: 'Looking at my absences, ' },
  { label: 'Commute', Icon: IconCommute, text: 'How do I get to campus from ' },
]

const MAX = 1000

interface ComposerProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  onStop: () => void
  pending: boolean
  locale: Locale
  onLocale: (locale: Locale) => void
  inputRef: React.RefObject<HTMLTextAreaElement | null>
  placeholder?: string
}

export function AskComposer({
  value,
  onChange,
  onSubmit,
  onStop,
  pending,
  locale,
  onLocale,
  inputRef,
  placeholder = 'Ask anything about your semester',
}: ComposerProps) {
  const [menu, setMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  /* Grow with the text, up to about six lines, then scroll. */
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`
  }, [value, inputRef])

  useEffect(() => {
    if (!menu) return
    const close = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenu(false)
    }
    const esc = (event: KeyboardEvent) => event.key === 'Escape' && setMenu(false)
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [menu])

  const empty = value.trim().length === 0
  const nextLocale = LOCALES[(LOCALES.findIndex((entry) => entry.value === locale) + 1) % LOCALES.length]

  return (
    <form
      className="ask-composer p-3"
      onSubmit={(event) => {
        event.preventDefault()
        if (!pending) onSubmit()
      }}
    >
      <label htmlFor="ask-input" className="sr-only">
        Ask OneTUP
      </label>
      <textarea
        id="ask-input"
        ref={inputRef}
        rows={1}
        maxLength={MAX}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          // Enter sends; Shift+Enter is a newline. On a phone the send button
          // is the real path, so this is a desktop affordance.
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault()
            if (!pending && !empty) onSubmit()
          }
        }}
      />

      <div className="mt-2 flex items-center gap-1.5">
        <div ref={menuRef} className="relative">
          <button
            type="button"
            className="ask-tool !px-0"
            data-active={menu}
            aria-label="Ask about…"
            aria-haspopup="menu"
            aria-expanded={menu}
            onClick={() => setMenu((open) => !open)}
          >
            <motion.span animate={{ rotate: menu ? 45 : 0 }} transition={transition(spring.snap)} className="grid">
              <IconPlus size={18} />
            </motion.span>
          </button>
          <AnimatePresence>
            {menu && (
              <motion.div
                role="menu"
                initial={{ opacity: 0, y: 8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.96 }}
                transition={transition(spring.snap)}
                className="absolute bottom-[calc(100%+0.5rem)] left-0 z-30 w-48 origin-bottom-left rounded-2xl p-1.5"
                style={{
                  background: 'var(--bg)',
                  boxShadow: 'var(--shadow-float), 0 0 0 1px rgb(24 24 27 / 0.05)',
                }}
              >
                <p className="px-2.5 pb-1 pt-1.5 text-[0.6875rem] font-semibold uppercase tracking-wider text-[var(--label-tertiary)]">
                  Ask about
                </p>
                {STARTERS.map(({ label, Icon, text }) => (
                  <button
                    key={label}
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[0.875rem] font-semibold hover:bg-[var(--canvas)]"
                    onClick={() => {
                      onChange(text)
                      setMenu(false)
                      inputRef.current?.focus()
                    }}
                  >
                    <Icon size={18} className="text-[var(--label-tertiary)]" />
                    {label}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <button
          type="button"
          className="ask-tool"
          aria-label={`Answer language: ${LOCALES.find((e) => e.value === locale)?.label}. Change to ${nextLocale.label}`}
          data-active={locale !== 'auto'}
          onClick={() => onLocale(nextLocale.value)}
        >
          <IconLanguage size={16} />
          {LOCALES.find((entry) => entry.value === locale)?.label}
        </button>

        <span className="flex-1" />

        {value.length > MAX * 0.8 && (
          <span className="text-[0.75rem] font-semibold tabular-nums text-[var(--label-tertiary)]">
            {value.length}/{MAX}
          </span>
        )}

        {pending ? (
          <button
            type="button"
            onClick={onStop}
            aria-label="Stop answering"
            className="grid size-10 shrink-0 place-items-center rounded-full"
            style={{ background: 'var(--label)', color: 'var(--bg)' }}
          >
            <IconStop size={16} />
          </button>
        ) : (
          <button
            type="submit"
            disabled={empty}
            aria-label="Send"
            className="glass glass-accent !size-10 !min-h-0 shrink-0 !rounded-full !p-0"
          >
            <IconArrowUpward size={19} strokeWidth={2.8} />
          </button>
        )}
      </div>
    </form>
  )
}
