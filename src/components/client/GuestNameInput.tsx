'use client';

import { useState, useCallback } from 'react';
import { Input } from '@/components/ui/Input';

export interface GuestNameInputProps {
  /** Current value of the guest name field */
  value: string;
  /** Callback when the value changes */
  onChange: (value: string) => void;
  /** Whether the input is visible (controlled by toggle state) */
  visible: boolean;
  /** External error message (e.g. from server action) */
  error?: string;
}

/** Regex: only letters (including accented) and spaces */
const VALID_NAME_PATTERN = /^[a-zA-ZÀ-ÿñÑ\s]*$/;

const MIN_LENGTH = 2;
const MAX_LENGTH = 100;

/**
 * Validates the guest name and returns an error message if invalid.
 * Returns empty string if valid.
 */
function validateGuestName(value: string): string {
  if (value.length === 0) {
    return '';
  }
  if (!VALID_NAME_PATTERN.test(value)) {
    return 'Solo se permiten letras y espacios.';
  }
  if (value.length < MIN_LENGTH) {
    return `El nombre debe tener al menos ${MIN_LENGTH} caracteres.`;
  }
  if (value.length > MAX_LENGTH) {
    return `El nombre no puede exceder ${MAX_LENGTH} caracteres.`;
  }
  return '';
}

/**
 * GuestNameInput – Text input for the guest's full name.
 *
 * Renders when visible=true (toggle is active). Validates:
 * - Length: 2-100 characters
 * - Content: alphabetic characters and spaces only
 *
 * Shows inline error message when validation fails.
 */
export function GuestNameInput({ value, onChange, visible, error }: GuestNameInputProps) {
  const [touched, setTouched] = useState(false);

  const validationError = touched ? validateGuestName(value) : '';
  const displayError = error || validationError;

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.value);
    },
    [onChange]
  );

  const handleBlur = useCallback(() => {
    setTouched(true);
  }, []);

  if (!visible) {
    return null;
  }

  return (
    <div className="w-full animate-[fade-in_0.2s_ease-out]">
      <Input
        id="guest-name"
        name="guestName"
        label="Nombre completo del invitado"
        placeholder="Ej. María García"
        value={value}
        onChange={handleChange}
        onBlur={handleBlur}
        error={displayError}
        required
        maxLength={MAX_LENGTH}
        aria-label="Nombre completo del invitado"
      />
    </div>
  );
}

/** Exported for use by parent components to validate before submit */
export { validateGuestName };
