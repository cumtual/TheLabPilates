'use client';

import { useState, useCallback } from 'react';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';

export interface AddGuestButtonProps {
  /** ID of the enrollment to add a guest to */
  enrollmentId: string;
  /** Whether this enrollment already has an associated guest */
  hasGuest: boolean;
  /** Whether the class has at least 1 available spot */
  hasCapacity: boolean;
  /** Whether the user is eligible (Open Lab membership + credits available) */
  isEligible: boolean;
  /** Whether the class date has already passed */
  isPastClass: boolean;
  /** Callback to submit the guest addition */
  onAddGuest: (enrollmentId: string, guestName: string) => Promise<void>;
  /** Whether the action is currently in progress (external loading state) */
  isLoading?: boolean;
}

/** Regex: only letters (including accented) and spaces */
const VALID_NAME_PATTERN = /^[a-zA-ZÀ-ÿñÑ\s]*$/;
const MIN_LENGTH = 2;
const MAX_LENGTH = 100;

function validateGuestName(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return 'El nombre del invitado es obligatorio.';
  }
  if (!VALID_NAME_PATTERN.test(trimmed)) {
    return 'Solo se permiten letras y espacios.';
  }
  if (trimmed.length < MIN_LENGTH) {
    return `El nombre debe tener al menos ${MIN_LENGTH} caracteres.`;
  }
  if (trimmed.length > MAX_LENGTH) {
    return `El nombre no puede exceder ${MAX_LENGTH} caracteres.`;
  }
  return '';
}

/**
 * AddGuestButton – Button to add a guest to an existing reservation.
 *
 * Hidden when:
 * - User already has a guest on this enrollment (hasGuest=true)
 * - The class date has passed (isPastClass=true)
 * - User is not eligible (no Open Lab membership or no credits) (isEligible=false)
 *
 * Disabled when:
 * - Class has no available capacity (hasCapacity=false) — shows "Clase llena"
 *
 * On click: expands to show a name input field and confirm/cancel buttons.
 */
export function AddGuestButton({
  enrollmentId,
  hasGuest,
  hasCapacity,
  isEligible,
  isPastClass,
  onAddGuest,
  isLoading = false,
}: AddGuestButtonProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Hidden conditions: already has guest, class passed, or not eligible
  if (hasGuest || isPastClass || !isEligible) {
    return null;
  }

  const isDisabled = !hasCapacity;

  const handleExpand = useCallback(() => {
    setIsExpanded(true);
    setFieldError(null);
    setServerError(null);
  }, []);

  const handleCancel = useCallback(() => {
    setIsExpanded(false);
    setGuestName('');
    setFieldError(null);
    setServerError(null);
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setFieldError(null);
      setServerError(null);

      const error = validateGuestName(guestName);
      if (error) {
        setFieldError(error);
        return;
      }

      setIsSubmitting(true);
      try {
        await onAddGuest(enrollmentId, guestName.trim());
        // On success, collapse the form and reset
        setIsExpanded(false);
        setGuestName('');
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'No se pudo agregar el invitado. Intenta de nuevo.';
        setServerError(message);
      } finally {
        setIsSubmitting(false);
      }
    },
    [enrollmentId, guestName, onAddGuest]
  );

  const pending = isLoading || isSubmitting;

  // Collapsed state: show just the button
  if (!isExpanded) {
    return (
      <button
        type="button"
        onClick={handleExpand}
        disabled={isDisabled}
        aria-label={isDisabled ? 'Agregar invitado - Clase llena' : 'Agregar invitado a esta reserva'}
        className={[
          'inline-flex items-center justify-center gap-1.5 min-h-11 min-w-11',
          'px-4 py-2 font-body text-body-md font-semibold',
          'rounded-DEFAULT transition-all duration-200 ease-out',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
          isDisabled
            ? 'text-outline cursor-not-allowed opacity-60'
            : 'text-primary underline underline-offset-2 hover:text-secondary cursor-pointer',
        ].join(' ')}
      >
        {isDisabled ? (
          <span>Clase llena</span>
        ) : (
          <>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-4 w-4"
              aria-hidden="true"
            >
              <path d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" />
            </svg>
            <span>Agregar invitado</span>
          </>
        )}
      </button>
    );
  }

  // Expanded state: show name input + confirm/cancel
  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 w-full animate-[fade-in_0.2s_ease-out]"
      aria-label="Formulario para agregar invitado a reserva existente"
      noValidate
    >
      {serverError && (
        <p
          role="alert"
          className="font-body text-[13px] text-error bg-error/10 rounded-DEFAULT px-3 py-2"
        >
          {serverError}
        </p>
      )}

      <Input
        id={`add-guest-name-${enrollmentId}`}
        name="guestName"
        label="Nombre completo del invitado"
        placeholder="Ej. María García"
        required
        value={guestName}
        onChange={(e) => {
          setGuestName(e.target.value);
          if (fieldError) setFieldError(null);
        }}
        error={fieldError ?? undefined}
        disabled={pending}
        maxLength={MAX_LENGTH}
        aria-required="true"
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center justify-center gap-2 min-h-11 min-w-11 px-5 py-3 font-semibold uppercase tracking-widest text-label-caps bg-soft-charcoal text-on-primary rounded-DEFAULT transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-soft-charcoal"
        >
          {pending ? (
            <>
              <Spinner size="sm" />
              Agregando...
            </>
          ) : (
            'Confirmar'
          )}
        </button>

        <button
          type="button"
          onClick={handleCancel}
          disabled={pending}
          className="inline-flex items-center justify-center min-h-11 min-w-11 px-5 py-3 font-semibold uppercase tracking-widest text-label-caps bg-transparent border border-soft-charcoal text-soft-charcoal rounded-DEFAULT transition-all duration-200 ease-out hover:bg-soft-charcoal hover:text-on-primary disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-soft-charcoal"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
