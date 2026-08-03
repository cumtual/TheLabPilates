'use client'

import { useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'

export type ModalVariant = 'default' | 'danger'

export interface ModalProps {
  /** Whether the modal is open */
  isOpen: boolean
  /** Callback when modal should close */
  onClose: () => void
  /** Callback when confirm action is triggered */
  onConfirm: () => void
  /** Modal title */
  title: string
  /** Modal body content */
  children: React.ReactNode
  /** Confirm button label */
  confirmLabel?: string
  /** Cancel button label */
  cancelLabel?: string
  /** Visual variant for the confirm button */
  variant?: ModalVariant
  /** Additional CSS classes */
  className?: string
}

export function Modal({
  isOpen,
  onClose,
  onConfirm,
  title,
  children,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variant = 'default',
  className = '',
}: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null)

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    },
    [onClose]
  )

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown)
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [isOpen, handleKeyDown])

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) {
      onClose()
    }
  }

  if (!isOpen) return null

  const confirmStyles =
    variant === 'danger'
      ? 'bg-error text-on-primary hover:bg-error/90'
      : 'bg-primary text-on-primary hover:bg-primary/90'

  const modal = (
    <div
      ref={overlayRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-soft-charcoal/50 backdrop-blur-sm animate-[fade-in_0.2s_ease-out]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div
        className={`w-full max-w-md bg-surface rounded-lg shadow-xl animate-[fade-in_0.2s_ease-out] ${className}`}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-2">
          <h2
            id="modal-title"
            className="font-headline text-headline-lg-mobile text-on-surface"
          >
            {title}
          </h2>
        </div>

        {/* Body */}
        <div className="px-6 py-4 font-body text-body-md text-on-surface-variant">
          {children}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 px-6 pb-6 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 min-h-11 min-w-11 font-body text-body-md font-semibold text-on-surface-variant bg-transparent border border-outline-variant rounded-DEFAULT transition-colors duration-200 hover:bg-surface-container-low focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary cursor-pointer"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`px-5 py-2.5 min-h-11 min-w-11 font-body text-body-md font-semibold rounded-DEFAULT transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary cursor-pointer ${confirmStyles}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
