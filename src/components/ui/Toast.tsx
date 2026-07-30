'use client'

import { useEffect } from 'react'

export type ToastVariant = 'success' | 'error' | 'info'

export interface ToastProps {
  /** Toast message text */
  message: string
  /** Visual variant determines the icon and color */
  variant?: ToastVariant
  /** Callback when toast is dismissed */
  onDismiss: () => void
  /** Additional CSS classes */
  className?: string
}

const variantStyles: Record<ToastVariant, string> = {
  success: 'border-l-primary bg-surface',
  error: 'border-l-error bg-surface',
  info: 'border-l-warm-wood bg-surface',
}

const variantIcons: Record<ToastVariant, string> = {
  success: 'check_circle',
  error: 'error',
  info: 'info',
}

const variantIconColors: Record<ToastVariant, string> = {
  success: 'text-primary',
  error: 'text-error',
  info: 'text-warm-wood',
}

export function Toast({
  message,
  variant = 'info',
  onDismiss,
  className = '',
}: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss()
    }, 5000)

    return () => clearTimeout(timer)
  }, [onDismiss])

  return (
    <div
      role="alert"
      aria-live="polite"
      className={[
        'fixed bottom-4 right-4 z-50',
        'flex items-center gap-3',
        'w-[calc(100%-2rem)] max-w-sm',
        'px-4 py-3 min-h-11',
        'rounded-DEFAULT shadow-lg',
        'border border-outline-variant/40 border-l-4',
        'animate-[fade-in_0.3s_ease-out]',
        variantStyles[variant],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span
        className={`material-symbols-outlined text-[20px] ${variantIconColors[variant]}`}
        aria-hidden="true"
      >
        {variantIcons[variant]}
      </span>
      <p className="flex-1 font-body text-[14px] text-on-surface">{message}</p>
      <button
        type="button"
        onClick={onDismiss}
        className="p-1 min-h-11 min-w-11 flex items-center justify-center text-outline hover:text-on-surface transition-colors cursor-pointer"
        aria-label="Cerrar notificación"
      >
        <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
          close
        </span>
      </button>
    </div>
  )
}
