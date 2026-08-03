'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { enrollInClassAction } from '@/actions/enrollment';

export interface EnrollButtonProps {
  classId: string;
}

export function EnrollButton({ classId }: EnrollButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const router = useRouter();

  async function handleEnroll() {
    setLoading(true);
    setError(null);

    try {
      const result = await enrollInClassAction(classId);
      if (result.success) {
        setSuccess(true);
        router.refresh();
      } else {
        setError(result.error);
      }
    } catch {
      setError('Error del servidor. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <span className="inline-flex items-center px-4 py-2 font-body text-sm font-semibold text-primary">
        ✓ Reservado
      </span>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleEnroll}
        disabled={loading}
        className="inline-flex items-center justify-center px-4 py-2 min-h-11 min-w-11 font-body text-sm font-semibold uppercase tracking-wider bg-soft-charcoal text-on-primary rounded-DEFAULT transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-soft-charcoal disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
      >
        {loading ? (
          <span className="inline-block h-4 w-4 rounded-full border-2 border-on-primary/30 border-t-on-primary animate-spin" />
        ) : (
          'Reservar'
        )}
      </button>
      {error && (
        <p className="font-body text-xs text-error max-w-50 text-right">
          {error}
        </p>
      )}
    </div>
  );
}
