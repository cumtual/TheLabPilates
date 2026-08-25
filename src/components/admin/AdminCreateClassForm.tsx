'use client';

import { useState, useRef, useTransition } from 'react';
import { adminCreateClassAction } from '@/actions/admin';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Modal } from '@/components/ui/Modal';
import { TIMEZONE } from '@/lib/utils/date';
import Link from 'next/link';
import type { ActionResult } from '@/lib/types';

const classTypeOptions = [
  { value: 'yoga', label: 'Yoga' },
  { value: 'mat_pilates', label: 'Mat Pilates' },
  { value: 'barre', label: 'Barre' },
];

const classTypeLabels: Record<string, string> = {
  yoga: 'Yoga',
  mat_pilates: 'Mat Pilates',
  barre: 'Barre',
};

interface Coach {
  id: string;
  username: string;
  email: string;
}

interface AdminCreateClassFormProps {
  coaches: Coach[];
}

function formatDateTime(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('es-MX', {
    timeZone: TIMEZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function AdminCreateClassForm({ coaches }: AdminCreateClassFormProps) {
  const [state, setState] = useState<ActionResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const [showConfirm, setShowConfirm] = useState(false);
  const [previewData, setPreviewData] = useState<{
    date: string;
    capacity: string;
    type: string;
    coachName: string;
  } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const coachOptions = coaches.map((c) => ({
    value: c.id,
    label: `${c.username} (${c.email})`,
  }));

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const date = formData.get('classDate') as string;
    const capacity = formData.get('capacity') as string;
    const classType = formData.get('classType') as string;
    const coachId = formData.get('coachId') as string;

    if (!date || !capacity || !classType || !coachId) {
      setState({ success: false, error: 'Todos los campos son obligatorios.' });
      return;
    }

    const coach = coaches.find((c) => c.id === coachId);
    setPreviewData({
      date,
      capacity,
      type: classType,
      coachName: coach?.username ?? 'Desconocido',
    });
    setShowConfirm(true);
  }

  function handleConfirm() {
    setShowConfirm(false);
    if (!formRef.current) return;

    const formData = new FormData(formRef.current);
    startTransition(async () => {
      try {
        const result = await adminCreateClassAction(null, formData);
        setState(result);
        if (result.success) {
          formRef.current?.reset();
        }
      } catch {
        setState({ success: false, error: 'Error al crear la clase. Intenta de nuevo.' });
      }
    });
  }

  return (
    <>
      <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-6 w-full max-w-md">
        {state && !state.success && (
          <p role="alert" className="font-body text-body-md text-error text-center bg-error/10 rounded-DEFAULT px-4 py-3">
            {state.error}
          </p>
        )}

        {state?.success && (
          <p role="status" className="font-body text-body-md text-on-surface text-center bg-primary/10 rounded-DEFAULT px-4 py-3">
            {state.message}
          </p>
        )}

        <Select
          id="coachId"
          name="coachId"
          label="Coach"
          options={coachOptions}
          placeholder="Selecciona un coach"
          required
          error={state && !state.success && state.field === 'coachId' ? state.error : undefined}
        />

        <Input
          id="classDate"
          name="classDate"
          type="datetime-local"
          label="Fecha y hora"
          required
          error={state && !state.success && state.field === 'classDate' ? state.error : undefined}
        />

        <Input
          id="capacity"
          name="capacity"
          type="number"
          label="Capacidad"
          placeholder="1-20"
          min={1}
          max={20}
          required
          error={state && !state.success && state.field === 'capacity' ? state.error : undefined}
        />

        <Select
          id="classType"
          name="classType"
          label="Tipo de clase"
          options={classTypeOptions}
          placeholder="Selecciona un tipo"
          required
          error={state && !state.success && state.field === 'classType' ? state.error : undefined}
        />

        <button
          type="submit"
          disabled={isPending}
          className="w-full min-h-11 px-6 py-3 font-semibold uppercase tracking-widest text-label-caps bg-soft-charcoal text-on-primary rounded-DEFAULT transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
        >
          {isPending ? 'Creando...' : 'Crear Clase'}
        </button>

        <Link
          href="/admin/classes"
          className="text-center text-primary underline underline-offset-2 hover:text-secondary transition-colors min-h-11 inline-flex items-center justify-center font-body text-body-md"
        >
          Volver a gestión de clases
        </Link>
      </form>

      <Modal
        isOpen={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={handleConfirm}
        title="Confirmar nueva clase"
        confirmLabel="Sí, crear clase"
        cancelLabel="Revisar datos"
        variant="default"
      >
        <div className="space-y-3">
          <p>¿Deseas crear esta clase con los siguientes datos?</p>
          {previewData && (
            <div className="bg-surface-container-low rounded-lg p-3 space-y-2">
              <div className="flex justify-between">
                <span className="font-body text-sm text-on-surface-variant">Coach:</span>
                <span className="font-body text-sm font-semibold text-on-surface">{previewData.coachName}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-body text-sm text-on-surface-variant">Tipo:</span>
                <span className="font-body text-sm font-semibold text-on-surface">
                  {classTypeLabels[previewData.type] ?? previewData.type}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="font-body text-sm text-on-surface-variant">Fecha:</span>
                <span className="font-body text-sm font-semibold text-on-surface capitalize">
                  {formatDateTime(previewData.date)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="font-body text-sm text-on-surface-variant">Capacidad:</span>
                <span className="font-body text-sm font-semibold text-on-surface">{previewData.capacity} alumnos</span>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
