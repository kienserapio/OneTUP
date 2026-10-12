import type { ComponentType } from 'react'
import type { IconProps } from './icon'

/**
 * A card's big faint glyph, drawn behind its content. Only meaningful inside
 * a `.card-glass`, which positions it in the bottom-right corner.
 */
export function Watermark({ Icon, size = 96 }: { Icon: ComponentType<IconProps>; size?: number }) {
  return (
    <span aria-hidden className="card-watermark">
      <Icon size={size} />
    </span>
  )
}
