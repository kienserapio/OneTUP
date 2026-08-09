'use client'

import { useEffect, useRef } from 'react'

/**
 * An animated lattice, drawn on a canvas behind the hero.
 *
 * Ported from React Bits' ShapeGrid to TypeScript. Two changes matter for this
 * product:
 *
 *   - It stops entirely when scrolled out of view or when the tab is hidden.
 *     A permanently running `requestAnimationFrame` behind a landing page is a
 *     battery cost paid by exactly the mid-range phones this is built for.
 *   - It renders nothing at all under `prefers-reduced-motion`. A full-viewport
 *     drifting grid is the textbook vestibular trigger, and the hero reads fine
 *     without it.
 */

export type GridDirection = 'diagonal' | 'up' | 'right' | 'down' | 'left'
export type GridShape = 'square' | 'hexagon' | 'circle' | 'triangle'

export interface ShapeGridProps {
  direction?: GridDirection
  speed?: number
  borderColor?: string
  squareSize?: number
  hoverFillColor?: string
  shape?: GridShape
  /** Previously hovered cells kept as a fading trail. 0 disables it. */
  hoverTrailAmount?: number
  className?: string
}

interface Cell {
  x: number
  y: number
}

export function ShapeGrid({
  direction = 'right',
  speed = 1,
  borderColor = '#999',
  squareSize = 40,
  hoverFillColor = '#222',
  shape = 'square',
  hoverTrailAmount = 0,
  className = '',
}: ShapeGridProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const frameRef = useRef<number | null>(null)
  const gridOffset = useRef({ x: 0, y: 0 })
  const hovered = useRef<Cell | null>(null)
  const trail = useRef<Cell[]>([])
  const opacities = useRef(new Map<string, number>())

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const isHex = shape === 'hexagon'
    const isTri = shape === 'triangle'
    const hexHoriz = squareSize * 1.5
    const hexVert = squareSize * Math.sqrt(3)

    const resize = () => {
      // Match the backing store to the device so the hairlines stay crisp.
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = canvas.offsetWidth * ratio
      canvas.height = canvas.offsetHeight * ratio
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    }
    window.addEventListener('resize', resize)
    resize()

    const width = () => canvas.offsetWidth
    const height = () => canvas.offsetHeight

    const drawHex = (cx: number, cy: number, size: number) => {
      ctx.beginPath()
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i
        const vx = cx + size * Math.cos(angle)
        const vy = cy + size * Math.sin(angle)
        if (i === 0) ctx.moveTo(vx, vy)
        else ctx.lineTo(vx, vy)
      }
      ctx.closePath()
    }

    const drawCircle = (cx: number, cy: number, size: number) => {
      ctx.beginPath()
      ctx.arc(cx, cy, size / 2, 0, Math.PI * 2)
      ctx.closePath()
    }

    const drawTriangle = (cx: number, cy: number, size: number, flip: boolean) => {
      ctx.beginPath()
      if (flip) {
        ctx.moveTo(cx, cy + size / 2)
        ctx.lineTo(cx + size / 2, cy - size / 2)
        ctx.lineTo(cx - size / 2, cy - size / 2)
      } else {
        ctx.moveTo(cx, cy - size / 2)
        ctx.lineTo(cx + size / 2, cy + size / 2)
        ctx.lineTo(cx - size / 2, cy + size / 2)
      }
      ctx.closePath()
    }

    const paintCell = (key: string, draw: () => void, fillRect?: () => void) => {
      const alpha = opacities.current.get(key)
      if (alpha) {
        ctx.globalAlpha = alpha
        ctx.fillStyle = hoverFillColor
        if (fillRect) fillRect()
        else {
          draw()
          ctx.fill()
        }
        ctx.globalAlpha = 1
      }
      draw()
      ctx.strokeStyle = borderColor
      ctx.stroke()
    }

    const drawGrid = () => {
      ctx.clearRect(0, 0, width(), height())
      ctx.lineWidth = 1

      if (isHex) {
        const colShift = Math.floor(gridOffset.current.x / hexHoriz)
        const offsetX = ((gridOffset.current.x % hexHoriz) + hexHoriz) % hexHoriz
        const offsetY = ((gridOffset.current.y % hexVert) + hexVert) % hexVert

        for (let col = -2; col < Math.ceil(width() / hexHoriz) + 3; col++) {
          for (let row = -2; row < Math.ceil(height() / hexVert) + 3; row++) {
            const cx = col * hexHoriz + offsetX
            const cy = row * hexVert + ((col + colShift) % 2 !== 0 ? hexVert / 2 : 0) + offsetY
            paintCell(`${col},${row}`, () => drawHex(cx, cy, squareSize))
          }
        }
      } else if (isTri) {
        const halfW = squareSize / 2
        const colShift = Math.floor(gridOffset.current.x / halfW)
        const rowShift = Math.floor(gridOffset.current.y / squareSize)
        const offsetX = ((gridOffset.current.x % halfW) + halfW) % halfW
        const offsetY = ((gridOffset.current.y % squareSize) + squareSize) % squareSize

        for (let col = -2; col < Math.ceil(width() / halfW) + 4; col++) {
          for (let row = -2; row < Math.ceil(height() / squareSize) + 4; row++) {
            const cx = col * halfW + offsetX
            const cy = row * squareSize + squareSize / 2 + offsetY
            const flip = (((col + colShift + row + rowShift) % 2) + 2) % 2 !== 0
            paintCell(`${col},${row}`, () => drawTriangle(cx, cy, squareSize, flip))
          }
        }
      } else if (shape === 'circle') {
        const offsetX = ((gridOffset.current.x % squareSize) + squareSize) % squareSize
        const offsetY = ((gridOffset.current.y % squareSize) + squareSize) % squareSize

        for (let col = -2; col < Math.ceil(width() / squareSize) + 3; col++) {
          for (let row = -2; row < Math.ceil(height() / squareSize) + 3; row++) {
            const cx = col * squareSize + squareSize / 2 + offsetX
            const cy = row * squareSize + squareSize / 2 + offsetY
            paintCell(`${col},${row}`, () => drawCircle(cx, cy, squareSize))
          }
        }
      } else {
        const offsetX = ((gridOffset.current.x % squareSize) + squareSize) % squareSize
        const offsetY = ((gridOffset.current.y % squareSize) + squareSize) % squareSize

        for (let col = -2; col < Math.ceil(width() / squareSize) + 3; col++) {
          for (let row = -2; row < Math.ceil(height() / squareSize) + 3; row++) {
            const sx = col * squareSize + offsetX
            const sy = row * squareSize + offsetY
            paintCell(
              `${col},${row}`,
              () => {
                ctx.beginPath()
                ctx.rect(sx, sy, squareSize, squareSize)
              },
              () => ctx.fillRect(sx, sy, squareSize, squareSize),
            )
          }
        }
      }
    }

    const settleOpacities = () => {
      const targets = new Map<string, number>()

      if (hovered.current) targets.set(`${hovered.current.x},${hovered.current.y}`, 1)

      if (hoverTrailAmount > 0) {
        trail.current.forEach((cell, index) => {
          const key = `${cell.x},${cell.y}`
          if (!targets.has(key)) {
            targets.set(key, (trail.current.length - index) / (trail.current.length + 1))
          }
        })
      }

      for (const [key] of targets) {
        if (!opacities.current.has(key)) opacities.current.set(key, 0)
      }

      for (const [key, opacity] of opacities.current) {
        const target = targets.get(key) ?? 0
        const next = opacity + (target - opacity) * 0.15
        if (next < 0.005) opacities.current.delete(key)
        else opacities.current.set(key, next)
      }
    }

    const tick = () => {
      const effective = Math.max(speed, 0.1)
      const wrapX = isHex ? hexHoriz * 2 : squareSize
      const wrapY = isHex ? hexVert : isTri ? squareSize * 2 : squareSize

      if (direction === 'right' || direction === 'diagonal') {
        gridOffset.current.x = (gridOffset.current.x - effective + wrapX) % wrapX
      }
      if (direction === 'left') {
        gridOffset.current.x = (gridOffset.current.x + effective + wrapX) % wrapX
      }
      if (direction === 'up') {
        gridOffset.current.y = (gridOffset.current.y + effective + wrapY) % wrapY
      }
      if (direction === 'down' || direction === 'diagonal') {
        gridOffset.current.y = (gridOffset.current.y - effective + wrapY) % wrapY
      }

      settleOpacities()
      drawGrid()
      frameRef.current = requestAnimationFrame(tick)
    }

    const cellAt = (mouseX: number, mouseY: number): Cell => {
      if (isHex) {
        const colShift = Math.floor(gridOffset.current.x / hexHoriz)
        const offsetX = ((gridOffset.current.x % hexHoriz) + hexHoriz) % hexHoriz
        const offsetY = ((gridOffset.current.y % hexVert) + hexVert) % hexVert
        const col = Math.round((mouseX - offsetX) / hexHoriz)
        const rowOffset = (col + colShift) % 2 !== 0 ? hexVert / 2 : 0
        return { x: col, y: Math.round((mouseY - offsetY - rowOffset) / hexVert) }
      }
      if (isTri) {
        const halfW = squareSize / 2
        const offsetX = ((gridOffset.current.x % halfW) + halfW) % halfW
        const offsetY = ((gridOffset.current.y % squareSize) + squareSize) % squareSize
        return {
          x: Math.round((mouseX - offsetX) / halfW),
          y: Math.floor((mouseY - offsetY) / squareSize),
        }
      }
      const offsetX = ((gridOffset.current.x % squareSize) + squareSize) % squareSize
      const offsetY = ((gridOffset.current.y % squareSize) + squareSize) % squareSize
      const round = shape === 'circle' ? Math.round : Math.floor
      return {
        x: round((mouseX - offsetX) / squareSize),
        y: round((mouseY - offsetY) / squareSize),
      }
    }

    const pushTrail = () => {
      if (!hovered.current || hoverTrailAmount <= 0) return
      trail.current.unshift({ ...hovered.current })
      if (trail.current.length > hoverTrailAmount) trail.current.length = hoverTrailAmount
    }

    const onMouseMove = (event: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      const cell = cellAt(event.clientX - rect.left, event.clientY - rect.top)
      if (!hovered.current || hovered.current.x !== cell.x || hovered.current.y !== cell.y) {
        pushTrail()
        hovered.current = cell
      }
    }

    const onMouseLeave = () => {
      pushTrail()
      hovered.current = null
    }

    canvas.addEventListener('mousemove', onMouseMove)
    canvas.addEventListener('mouseleave', onMouseLeave)

    let onScreen = false
    let pageVisible = !document.hidden

    const start = () => {
      if (onScreen && pageVisible && frameRef.current === null) {
        frameRef.current = requestAnimationFrame(tick)
      }
    }
    const stop = () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current)
        frameRef.current = null
      }
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        onScreen = entry.isIntersecting
        if (onScreen) start()
        else stop()
      },
      { threshold: 0 },
    )
    observer.observe(canvas)

    const onVisibility = () => {
      pageVisible = !document.hidden
      if (pageVisible) start()
      else stop()
    }
    document.addEventListener('visibilitychange', onVisibility)

    start()

    return () => {
      window.removeEventListener('resize', resize)
      stop()
      observer.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      canvas.removeEventListener('mousemove', onMouseMove)
      canvas.removeEventListener('mouseleave', onMouseLeave)
    }
  }, [direction, speed, borderColor, hoverFillColor, squareSize, shape, hoverTrailAmount])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={`block h-full w-full border-0 ${className}`}
    />
  )
}

export default ShapeGrid
