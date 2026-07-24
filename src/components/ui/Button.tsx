'use client'

import { type ComponentPropsWithoutRef } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'outline'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps {
  /** Visual style variant */
  variant?: ButtonVariant
  /** Button size */
  size?: ButtonSize
  /** If provided, renders as an anchor element */
  href?: string
  /** Click handler (only applies when rendered as button) */
  onClick?: () => void
  /** Accessible label for screen readers */
  ariaLabel?: string
  /** Whether the button takes full width of its container */
  fullWidth?: boolean
  /** Additional CSS classes */
  className?: string
  /** Button content */
  children: React.ReactNode
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    'bg-soft-charcoal text-on-primary hover:shadow-lg',
  secondary:
    'bg-primary text-on-primary hover:shadow-lg',
  outline:
    'bg-transparent border border-soft-charcoal text-soft-charcoal hover:bg-soft-charcoal hover:text-on-primary',
}

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'px-4 py-2 text-[11px]',
  md: 'px-6 py-3 text-label-caps',
  lg: 'px-8 py-4 text-label-caps',
}

export function Button({
  variant = 'primary',
  size = 'md',
  href,
  onClick,
  ariaLabel,
  fullWidth = false,
  className = '',
  children,
}: ButtonProps) {
  const baseStyles = [
    // Typography: label-caps style
    'font-semibold uppercase tracking-[0.1em]',
    // Shape
    'rounded-DEFAULT',
    // Transitions & hover
    'transition-all duration-200 ease-out',
    'hover:-translate-y-0.5',
    // Focus ring for accessibility
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-soft-charcoal',
    // Layout
    'inline-flex items-center justify-center',
    // Cursor
    'cursor-pointer',
  ].join(' ')

  const widthStyle = fullWidth ? 'w-full' : ''

  const classes = [
    baseStyles,
    variantStyles[variant],
    sizeStyles[size],
    widthStyle,
    className,
  ]
    .filter(Boolean)
    .join(' ')

  const sharedProps = {
    className: classes,
    'aria-label': ariaLabel,
  }

  if (href) {
    return (
      <a href={href} {...sharedProps} role="link">
        {children}
      </a>
    )
  }

  return (
    <button type="button" onClick={onClick} {...sharedProps}>
      {children}
    </button>
  )
}
