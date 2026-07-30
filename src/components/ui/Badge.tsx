export type BadgeVariant =
  | 'confirmed'
  | 'pending'
  | 'expired'
  | 'active'
  | 'cancelled'
  | 'absent'

export interface BadgeProps {
  /** Visual variant determines the color scheme */
  variant: BadgeVariant
  /** Badge content */
  children: React.ReactNode
  /** Additional CSS classes */
  className?: string
}

const variantStyles: Record<BadgeVariant, string> = {
  confirmed: 'bg-primary/15 text-primary border-primary/30',
  pending: 'bg-warm-wood/15 text-secondary border-warm-wood/30',
  expired: 'bg-surface-container-high text-outline border-outline-variant',
  active: 'bg-primary/15 text-primary border-primary/30',
  cancelled: 'bg-error/10 text-error border-error/30',
  absent: 'bg-error/10 text-error border-error/30',
}

export function Badge({ variant, children, className = '' }: BadgeProps) {
  return (
    <span
      className={[
        'inline-flex items-center',
        'px-2.5 py-1 min-h-[24px]',
        'font-body text-[12px] font-semibold leading-none',
        'rounded-full border',
        'whitespace-nowrap',
        variantStyles[variant],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </span>
  )
}
