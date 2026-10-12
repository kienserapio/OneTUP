'use client'

import { useEffect, useState } from 'react'

/**
 * Whether the app's chrome should get out of the way.
 *
 * `scrolled` — content has gone under the top bar, so it should take on a
 * surface. `hidden` — the student is reading down the page, so both bars can
 * slide away and give the screen back; they return on the first scroll up.
 *
 * The document is the scroll container (see `.app-scroll`), so this listens on
 * the window. Small movements are ignored, which is what stops a bar from
 * flickering under a thumb that rests on the glass, and the bars always come
 * back near the top of a page and at the very bottom of one — where the next
 * thing a student does is navigate.
 */
export function useScrollChrome({ threshold = 8, revealTop = 72 } = {}) {
  const [state, setState] = useState({ scrolled: false, hidden: false })

  useEffect(() => {
    let last = window.scrollY
    let frame = 0

    const update = () => {
      frame = 0
      const y = Math.max(0, window.scrollY)
      const delta = y - last
      const atBottom = window.innerHeight + y >= document.documentElement.scrollHeight - 4

      setState((previous) => {
        let hidden = previous.hidden
        if (y < revealTop || atBottom) hidden = false
        else if (delta > threshold) hidden = true
        else if (delta < -threshold) hidden = false

        const scrolled = y > 4
        return hidden === previous.hidden && scrolled === previous.scrolled
          ? previous
          : { scrolled, hidden }
      })

      if (Math.abs(delta) > threshold || y < revealTop) last = y
    }

    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update)
    }

    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [threshold, revealTop])

  return state
}
