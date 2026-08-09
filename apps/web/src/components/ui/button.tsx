'use client'

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import Link from 'next/link'
import { cx } from '@/lib/cx'

/**
 * The glass button.
 *
 * Two things matter more than the styling: the press state fires on
 * pointer-down rather than on release, and the transform is a scale on the
 * compositor. Waiting for `click` to show feedback is the single most reliable
 * way to make an interface feel dead.
 */

export type ButtonVariant = 'glass' | 'accent' | 'plain' | 'destructive'
export type ButtonSize = 'sm' | 'md' | 'lg'

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  glass: '',
  accent: 'glass-accent',
  plain: 'glass-plain',
  destructive: 'glass-plain glass-destructive',
}

const SIZE_CLASS: Record<ButtonSize, string> = {
  sm: 'glass-sm',
  md: '',
  lg: 'glass-lg',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  block?: boolean
  leading?: ReactNode
  trailing?: ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'glass', size = 'md', block, leading, trailing, className, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={props.type ?? 'button'}
      className={cx(
        'glass',
        VARIANT_CLASS[variant],
        SIZE_CLASS[size],
        block && 'glass-block',
        className,
      )}
      {...props}
    >
      {leading}
      {children}
      {trailing}
    </button>
  )
})

export interface ButtonLinkProps {
  href: string
  variant?: ButtonVariant
  size?: ButtonSize
  block?: boolean
  leading?: ReactNode
  trailing?: ReactNode
  className?: string
  children: ReactNode
  prefetch?: boolean
}

export function ButtonLink({
  href,
  variant = 'glass',
  size = 'md',
  block,
  leading,
  trailing,
  className,
  children,
  prefetch,
}: ButtonLinkProps) {
  return (
    <Link
      href={href as never}
      prefetch={prefetch}
      className={cx(
        'glass',
        VARIANT_CLASS[variant],
        SIZE_CLASS[size],
        block && 'glass-block',
        className,
      )}
    >
      {leading}
      {children}
      {trailing}
    </Link>
  )
}

/**
 * A circular icon button. Kept at the 44px minimum even when the glyph inside
 * is 20px — the target is what a thumb hits, not what the eye sees.
 */
export function IconButton({
  label,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cx(
        'glass aspect-square rounded-full !px-0',
        'min-w-[var(--target-min)]',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}
