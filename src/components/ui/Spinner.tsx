export type SpinnerSize = 'sm' | 'md' | 'lg'

export interface SpinnerProps {
  /** Spinner size */
  size?: SpinnerSize
  /** Additional CSS classes */
  className?: string
}

const sizeStyles: Record<SpinnerSize, string> = {
  sm: 'h-4 w-4 border-2',
  md: 'h-6 w-6 border-2',
  lg: 'h-10 w-10 border-3',
}

export function Spinner({ size = 'md', className = '' }: SpinnerProps) {
  return (
    <div
      role="status"
      aria-label="Cargando"
      className={[
        'inline-block rounded-full',
        'border-primary/30 border-t-primary',
        'animate-spin',
        sizeStyles[size],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span className="sr-only">Cargando...</span>
    </div>
  )
}
