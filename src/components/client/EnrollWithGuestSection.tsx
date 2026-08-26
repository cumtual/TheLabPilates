'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { enrollInClassAction } from '@/actions/enrollment';
import { checkGuestEligibilityAction, enrollWithGuestAction } from '@/actions/guest';
import { GuestToggle } from './GuestToggle';
import { GuestNameInput, validateGuestName } from './GuestNameInput';
import type { GuestEligibilityResult } from '@/lib/types/guest';

export interface EnrollWithGuestSectionProps {
  classId: string;
}

/**
 * EnrollWithGuestSection – Replaces the simple EnrollButton when guest
 * functionality needs to be integrated into the class reservation flow.
 *
 * On mount, checks guest eligibility. Shows the GuestToggle if the user
 * has an active Open Lab membership. When the toggle is on, shows
 * GuestNameInput. The submit button calls either enrollWithGuestAction
 * (if guest is toggled on with a valid name) or enrollInClassAction (regular).
 *
 * Layout: vertical stacked on mobile (<768px), horizontal on desktop (>=768px)
 * for the toggle + input area.
 *
 * Requirements: 1.2, 3.1, 3.8, 8.1, 8.2
 */
export function EnrollWithGuestSection({ classId }: EnrollWithGuestSectionProps) {
  const router = useRouter();

  // Enrollment state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Guest eligibility state
  const [eligibility, setEligibility] = useState<GuestEligibilityResult | null>(null);
  const [eligibilityLoading, setEligibilityLoading] = useState(true);

  // Guest form state
  const [guestToggled, setGuestToggled] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [guestNameError, setGuestNameError] = useState<string | undefined>(undefined);

  // Fetch eligibility on mount
  const fetchEligibility = useCallback(async () => {
    setEligibilityLoading(true);
    try {
      const result = await checkGuestEligibilityAction();
      setEligibility(result);
    } catch {
      // On error, set eligibility to null (toggle will be hidden)
      setEligibility(null);
    } finally {
      setEligibilityLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEligibility();
  }, [fetchEligibility]);

  // Handle toggle change (req 3.8: when toggled off, clear name and errors)
  const handleToggle = useCallback((checked: boolean) => {
    setGuestToggled(checked);
    if (!checked) {
      setGuestName('');
      setGuestNameError(undefined);
    }
  }, []);

  // Handle enrollment submission
  async function handleEnroll() {
    setError(null);
    setGuestNameError(undefined);

    // If guest is toggled on, validate name before submitting
    if (guestToggled) {
      const trimmedName = guestName.trim();
      const nameValidation = validateGuestName(trimmedName);
      if (trimmedName.length === 0) {
        setGuestNameError('El nombre del invitado es obligatorio.');
        return;
      }
      if (nameValidation) {
        setGuestNameError(nameValidation);
        return;
      }
    }

    setLoading(true);

    try {
      let result;

      if (guestToggled && guestName.trim().length >= 2) {
        // Enroll with guest
        result = await enrollWithGuestAction(classId, guestName.trim());
      } else {
        // Regular enrollment
        result = await enrollInClassAction(classId);
      }

      if (result.success) {
        setSuccess(true);
        router.refresh();
      } else {
        // Check if the error is related to the guest name field
        if ('field' in result && result.field === 'guestName') {
          setGuestNameError(result.error);
        } else {
          setError(result.error);
        }
      }
    } catch {
      setError('Error del servidor. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  // Success state
  if (success) {
    return (
      <span className="inline-flex items-center px-4 py-2 font-body text-sm font-semibold text-primary">
        ✓ Reservado
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-3 w-full">
      {/* Guest toggle + name input section */}
      {/* Layout: vertical on mobile, horizontal on desktop (req 8.1) */}
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:gap-4">
        <GuestToggle
          eligibility={eligibility}
          isLoading={eligibilityLoading}
          onToggle={handleToggle}
          checked={guestToggled}
          onRetry={fetchEligibility}
        />
        <GuestNameInput
          value={guestName}
          onChange={setGuestName}
          visible={guestToggled}
          error={guestNameError}
        />
      </div>

      {/* Action row: error message + submit button */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        {error && (
          <p className="font-body text-xs text-error min-w-0 break-words">
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={handleEnroll}
          disabled={loading}
          className="sm:ml-auto inline-flex items-center justify-center px-4 py-2 min-h-11 min-w-11 font-body text-sm font-semibold uppercase tracking-wider bg-soft-charcoal text-on-primary rounded-DEFAULT transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-soft-charcoal disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
        >
          {loading ? (
            <span className="inline-block h-4 w-4 rounded-full border-2 border-on-primary/30 border-t-on-primary animate-spin" />
          ) : guestToggled ? (
            'Reservar con invitado'
          ) : (
            'Reservar'
          )}
        </button>
      </div>
    </div>
  );
}
