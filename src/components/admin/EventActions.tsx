'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  cancelSpecialEventAction,
  completeSpecialEventAction,
  toggleEventLandingAction,
} from '@/actions/admin-events';
import { Modal } from '@/components/ui/Modal';

interface EventActionsProps {
  eventId: string;
  status: 'active' | 'cancelled' | 'completed';
  showOnLanding: boolean;
}

export function EventActions({ eventId, status, showOnLanding }: EventActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmComplete, setConfirmComplete] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const isActive = status === 'active';

  function run(action: () => Promise<{ success: boolean; message?: string; error?: string }>) {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.success) {
        setMessage(result.message ?? 'Listo.');
        router.refresh();
      } else {
        setError(result.error ?? 'No se pudo completar la acción.');
      }
    });
  }

  return (
    <div className="space-y-3">
      {message && (
        <p role="status" className="font-body text-sm text-on-surface bg-primary/10 rounded-DEFAULT px-4 py-3">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="font-body text-sm text-error bg-error/10 rounded-DEFAULT px-4 py-3">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        {isActive && (
          <button
            type="button"
            disabled={isPending}
            onClick={() => run(() => toggleEventLandingAction(eventId, !showOnLanding))}
            className="inline-flex items-center justify-center min-h-11 px-5 py-3 font-body text-sm font-semibold uppercase tracking-wider bg-transparent border border-soft-charcoal text-soft-charcoal rounded-DEFAULT transition-colors hover:bg-soft-charcoal hover:text-on-primary disabled:opacity-50"
          >
            {showOnLanding ? 'Ocultar de landing' : 'Mostrar en landing'}
          </button>
        )}

        {isActive && (
          <button
            type="button"
            disabled={isPending}
            onClick={() => setConfirmComplete(true)}
            className="inline-flex items-center justify-center min-h-11 px-5 py-3 font-body text-sm font-semibold uppercase tracking-wider bg-soft-charcoal text-on-primary rounded-DEFAULT transition-all hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-50"
          >
            Finalizar evento
          </button>
        )}

        {status !== 'cancelled' && (
          <button
            type="button"
            disabled={isPending}
            onClick={() => setConfirmCancel(true)}
            className="inline-flex items-center justify-center min-h-11 px-5 py-3 font-body text-sm font-semibold uppercase tracking-wider bg-error text-on-primary rounded-DEFAULT transition-all hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-50"
          >
            Cancelar evento
          </button>
        )}
      </div>

      <Modal
        isOpen={confirmComplete}
        onClose={() => setConfirmComplete(false)}
        onConfirm={() => {
          setConfirmComplete(false);
          run(() => completeSpecialEventAction(eventId));
        }}
        title="Finalizar evento"
        confirmLabel="Sí, finalizar"
        cancelLabel="Cancelar"
      >
        <p>
          El evento se marcará como finalizado y dejará de mostrarse en la landing. Las reservas
          existentes no se modifican.
        </p>
      </Modal>

      <Modal
        isOpen={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        onConfirm={() => {
          setConfirmCancel(false);
          run(() => cancelSpecialEventAction(eventId));
        }}
        title="Cancelar evento especial"
        confirmLabel="Sí, cancelar evento"
        cancelLabel="Volver"
        variant="danger"
      >
        <div className="space-y-3">
          <p className="font-semibold text-error">Esta acción no se puede deshacer.</p>
          <p>
            Se cancelarán el evento y todas sus clases. Se notificará por correo a todos los
            inscritos que el evento se canceló por causas externas al estudio y que se procesará
            el reembolso manual de su dinero.
          </p>
        </div>
      </Modal>
    </div>
  );
}
