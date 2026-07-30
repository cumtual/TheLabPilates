export interface CardProps {
  /** Card content */
  children: React.ReactNode
  /** Additional CSS classes */
  className?: string
}

export function Card({ children, className = '' }: CardProps) {
  return (
    <div
      className={[
        'bg-surface rounded-lg shadow-sm',
        'border border-outline-variant/40',
        'p-5 sm:p-6',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </div>
  )
}
