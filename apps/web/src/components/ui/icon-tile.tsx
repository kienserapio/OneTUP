import type { ComponentType } from 'react'
import { cx } from '@/lib/cx'
import type { IconProps } from './icon'

/**
 * The whole palette, on purpose. Crimson marks what is important or needs the
 * student, gray is everything else, and green and blue are indicators only —
 * done or on track, and informational. Never a background behind an icon.
 */
export type Tone = 'crimson' | 'green' | 'blue' | 'gray'

/**
 * A feature's glyph in its tone — the app's way of putting the icon first and
 * the word second. Solid colour, no tile behind it.
 *
 * `size` is the box the glyph sits in, kept so layouts built around tiles keep
 * their rhythm. `solid` fills more of that box, for the one glyph on a screen
 * that should be the loudest thing on it.
 */
export function IconTile({
  Icon,
  tone = 'crimson',
  variant = 'soft',
  size = 40,
  className,
}: {
  Icon: ComponentType<IconProps>
  tone?: Tone
  variant?: 'soft' | 'solid'
  size?: number
  className?: string
}) {
  return (
    <span
      aria-hidden
      data-tone={tone}
      data-variant={variant}
      className={cx('icon-tile glyph', className)}
      style={{ width: size, height: size }}
    >
      <Icon size={Math.round(size * (variant === 'solid' ? 0.86 : 0.74))} />
    </span>
  )
}
