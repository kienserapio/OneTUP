'use client'

import { useEffect } from 'react'

/**
 * Keeps a field in view while the on-screen keyboard is up.
 *
 * iOS leaves the layout viewport alone and covers it, Android either covers it
 * or resizes it, and neither moves a field that sits under a fixed bar. So this
 * does three things for every text entry in the app, without each screen having
 * to know:
 *
 * - `html[data-keyboard='open']` while one is focused, so the floating tab bar
 *   can slide away rather than sit between the field and the keyboard;
 * - `--kb-inset`, how much of the bottom the keyboard covers, so a bottom sheet
 *   can lift above it;
 * - a smooth scroll that brings the focused field to the middle of what is
 *   actually visible, but only when it would otherwise be hidden.
 */

const ENTRY =
  'input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=button]):not([type=submit]):not([type=file]):not([type=color]), textarea, select, [contenteditable=true]'

const TOP_CLEARANCE = 84
const BOTTOM_CLEARANCE = 20

export function KeyboardAware() {
  useEffect(() => {
    const root = document.documentElement
    const viewport = window.visualViewport
    let frame = 0
    let blurTimer = 0

    const entry = () => {
      const active = document.activeElement
      return active instanceof HTMLElement && active.matches(ENTRY) ? active : null
    }

    const setInset = () => {
      const covered = viewport
        ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
        : 0
      root.style.setProperty('--kb-inset', `${Math.round(covered)}px`)
    }

    const reveal = () => {
      const field = entry()
      if (!field) return
      const rect = field.getBoundingClientRect()
      const visibleBottom = (viewport?.height ?? window.innerHeight) - BOTTOM_CLEARANCE
      if (rect.bottom > visibleBottom || rect.top < TOP_CLEARANCE) {
        field.scrollIntoView({ block: 'center', behavior: 'smooth' })
      }
    }

    const onFocusIn = () => {
      window.clearTimeout(blurTimer)
      if (!entry()) return
      root.dataset.keyboard = 'open'
      setInset()
      // Once now, and again after the keyboard has finished rising.
      window.setTimeout(reveal, 60)
      window.setTimeout(() => {
        setInset()
        reveal()
      }, 380)
    }

    const onFocusOut = () => {
      // Focus often moves straight to another field; wait before calling it closed.
      blurTimer = window.setTimeout(() => {
        if (entry()) return
        delete root.dataset.keyboard
        root.style.setProperty('--kb-inset', '0px')
      }, 120)
    }

    const onViewport = () => {
      if (frame) return
      frame = window.requestAnimationFrame(() => {
        frame = 0
        setInset()
        if (entry()) reveal()
      })
    }

    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    viewport?.addEventListener('resize', onViewport)
    viewport?.addEventListener('scroll', onViewport)
    return () => {
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
      viewport?.removeEventListener('resize', onViewport)
      viewport?.removeEventListener('scroll', onViewport)
      window.clearTimeout(blurTimer)
      if (frame) window.cancelAnimationFrame(frame)
      delete root.dataset.keyboard
    }
  }, [])

  return null
}
