'use client';

import { type GuestEligibilityResult } from '@/lib/types/guest';

export interface GuestToggleProps {
  /** Eligibility result from the server. null means user doesn't have Open Lab membership. */
  eligibility: GuestEligibilityResult | null;
  /** Whether the eligibility check is still loading */
  isLoading: boolean;
  /** Callback when the toggle is changed */
  onToggle: (checked: boolean) => void;
  /** Current toggle state */
  checked: boolean;
  /** Callback to retry the eligibility check on error */
  onRetry?: () => void;
}

export function GuestToggle({
  eligibility,
  isLoading,
  onToggle,
  checked,
  onRetry,
}: GuestToggleProps) {
  // Hidden: user doesn't have Open Lab membership (eligibility is null and not loading)
  if (!isLoading && eligibility === null) {
    return null;
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center gap-3 py-2">
        <div className="h-5 w-9 rounded-full bg-surface-container-high animate-pulse" />
        <div className="h-4 w-48 rounded bg-surface-container-high animate-pulse" />
      </div>
    );
  }

  // Error state: verification failed (connection error)
  if (eligibility && !eligibility.eligible && eligibility.reason && isConnectionError(eligibility.reason)) {
    return (
      <div className="flex flex-col gap-2 rounded-DEFAULT border border-error/30 bg-error/5 p-3">
        <p className="font-body text-[13px] text-error">
          No se pudo verificar la elegibilidad para invitados.
        </p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="self-start inline-flex items-center justify-center px-3 py-1.5 min-h-11 min-w-11 font-body text-[13px] font-semibold text-primary underline underline-offset-2 transition-colors duration-200 hover:text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary rounded-DEFAULT"
          >
            Reintentar
          </button>
        )}
      </div>
    );
  }

  // Disabled state: eligible but credits = 0
  const isDisabled = eligibility !== null && eligibility.creditsAvailable === 0;

  return (
    <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-4">
      <label
        htmlFor="guest-toggle"
        className="relative inline-flex items-center gap-3 cursor-pointer group"
        aria-disabled={isDisabled}
      >
        {/* Toggle switch */}
        <div className="relative">
          <input
            id="guest-toggle"
            type="checkbox"
            role="switch"
            checked={checked}
            disabled={isDisabled}
            onChange={(e) => {
              if (!isDisabled) {
                onToggle(e.target.checked);
              }
            }}
            className="sr-only peer"
            aria-describedby={isDisabled ? 'guest-toggle-tooltip' : undefined}
          />
          <div
            className={[
              'w-9 h-5 rounded-full transition-colors duration-200',
              'peer-focus-visible:ring-2 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-primary',
              checked
                ? 'bg-primary'
                : 'bg-outline-variant',
              isDisabled
                ? 'opacity-50 cursor-not-allowed'
                : 'cursor-pointer',
            ].join(' ')}
          />
          <div
            className={[
              'absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-on-primary shadow-sm transition-transform duration-200',
              checked ? 'translate-x-4' : 'translate-x-0',
            ].join(' ')}
          />
        </div>

        {/* Label text */}
        <span
          className={[
            'font-body text-body-md select-none',
            isDisabled ? 'text-outline' : 'text-on-surface',
          ].join(' ')}
        >
          ¿Deseas agregar un invitado?
        </span>
      </label>

      {/* Tooltip for disabled state (credits exhausted) */}
      {isDisabled && (
        <p
          id="guest-toggle-tooltip"
          className="font-body text-[13px] text-outline"
          role="status"
        >
          Ya utilizaste tu invitado en el ciclo mensual actual
        </p>
      )}
    </div>
  );
}

/** Determine if a reason string indicates a connection/server error */
function isConnectionError(reason: string): boolean {
  const errorKeywords = ['conexión', 'connection', 'timeout', 'servidor', 'server', 'verificar', 'error'];
  return errorKeywords.some((keyword) => reason.toLowerCase().includes(keyword));
}
