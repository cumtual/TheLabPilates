'use client';

import { useState, useTransition } from 'react';
import { adminAddGuestAction } from '@/actions/admin-guest';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';

interface AdminAddGuestFormProps {
  classId: string;
  onSuccess?: () => void;
}

export function AdminAddGuestForm({ classId, onSuccess }: AdminAddGuestFormProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleExpand() {
    setIsExpanded(true);
    setError(null);
    setFieldError(null);
    setSuccessMessage(null);
  }

  function handleCancel() {
    setIsExpanded(false);
    setGuestName('');
    setError(null);
    setFieldError(null);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setFieldError(null);
    setSuccessMessage(null);

    const trimmed = guestName.trim();

    // Client-side validation: 1-100 characters
    if (trimmed.length < 1) {
      setFieldError('El nombre del invitado es obligatorio.');
      return;
    }
    if (trimmed.length > 100) {
      setFieldError('El nombre del invitado no puede exceder 100 caracteres.');
      return;
    }

    startTransition(async () => {
      try {
        const result = await adminAddGuestAction(classId, trimmed);

        if (result.success) {
          setGuestName('');
          setIsExpanded(false);
          setSuccessMessage(result.message ?? '¡Invitado agregado exitosamente!');
          onSuccess?.();
        } else {
          if (result.field === 'guestName') {
            setFieldError(result.error);
          } else {
            setError(result.error);
          }
        }
      } catch {
        setError('No se pudo agregar el invitado. Intenta de nuevo.');
      }
    });
  }

  if (!isExpanded) {
    return (
      <div className="space-y-3">
        {successMessage && (
          <p
            role="status"
            className="font-body text-body-md text-on-surface text-center bg-primary/10 rounded-DEFAULT px-4 py-3"
          >
            {successMessage}
          </p>
        )}
        <button
          type="button"
          onClick={handleExpand}
          className="inline-flex items-center justify-center gap-2 min-h-11 min-w-11 px-5 py-3 font-semibold uppercase tracking-widest text-label-caps bg-soft-charcoal text-on-primary rounded-DEFAULT transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-soft-charcoal"
          aria-label="Agregar invitado a la clase"
        >
          <span aria-hidden="true">+</span>
          Agregar Invitado
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4"
      aria-label="Formulario para agregar invitado"
      noValidate
    >
      {error && (
        <p
          role="alert"
          className="font-body text-body-md text-error text-center bg-error/10 rounded-DEFAULT px-4 py-3"
        >
          {error}
        </p>
      )}

      <Input
        id="admin-guest-name"
        name="guestName"
        label="Nombre del invitado"
        placeholder="Nombre completo"
        required
        value={guestName}
        onChange={(e) => {
          setGuestName(e.target.value);
          if (fieldError) setFieldError(null);
        }}
        error={fieldError ?? undefined}
        disabled={isPending}
        maxLength={100}
        aria-required="true"
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center justify-center gap-2 min-h-11 min-w-11 px-5 py-3 font-semibold uppercase tracking-widest text-label-caps bg-soft-charcoal text-on-primary rounded-DEFAULT transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-soft-charcoal"
        >
          {isPending ? (
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
          disabled={isPending}
          className="inline-flex items-center justify-center min-h-11 min-w-11 px-5 py-3 font-semibold uppercase tracking-widest text-label-caps bg-transparent border border-soft-charcoal text-soft-charcoal rounded-DEFAULT transition-all duration-200 ease-out hover:bg-soft-charcoal hover:text-on-primary disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-soft-charcoal"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
