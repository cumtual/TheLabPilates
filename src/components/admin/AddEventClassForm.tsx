'use client';

import { useState, useRef, useTransition } from 'react';
import { addEventClassAction } from '@/actions/admin-events';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Modal } from '@/components/ui/Modal';
import {
  parseDateTimeLocalAsMexicoCity,
  formatFullDateTime,
  toMexicoCityDatetimeLocal,
} from '@/lib/utils/date';
import { getClassDisplayName } from '@/lib/utils/class-type';
import type { ActionResult } from '@/lib/types';

const classTypeOptions = [
  { value: 'yoga', label: 'Yoga' },
  { value: 'mat_pilates', label: 'Mat Pilates' },
  { value: 'barre', label: 'Barre' },
  { value: 'personalizada', label: 'Personalizada' },
];

interface Coach {
  id: string;
  username: string;
  email: string;
}

interface AddEventClassFormProps {
  eventId: string;
  coaches: Coach[];
  disabled?: boolean;
  /** ISO string of the event start — bounds the class datetime-local input. */
  eventStart?: string | null;
  /** ISO string of the event end — bounds the class datetime-local input. */
  eventEnd?: string | null;
}

interface PreviewData {
  date: string;
  capacity: string;
  type: string;
  coachName: string;
  customName: string | null;
}

export function AddEventClassForm({
  eventId,
  coaches,
  disabled = false,
  eventStart = null,
  eventEnd = null,
}: AddEventClassFormProps) {
  const [state, setState] = useState<ActionResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const [showConfirm, setShowConfirm] = useState(false);
  const [selectedType, setSelectedType] = useState('');
  const [customName, setCustomName] = useState('');
  const [preview, setPreview] = useState<PreviewData | null>(null);
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
    const customNameValue = formData.get('customName') as string;

    if (!date || !capacity || !classType || !coachId) {
      setState({ success: false, error: 'Todos los campos son obligatorios.' });
      return;
    }
    if (classType === 'personalizada' && !customNameValue?.trim()) {
      setState({
        success: false,
        error: 'El nombre de la clase personalizada es obligatorio',
        field: 'customName',
      });
      return;
    }

    const parsedDate = parseDateTimeLocalAsMexicoCity(date);
    if (eventStart && parsedDate < new Date(eventStart)) {
      setState({
        success: false,
        error: `La clase no puede ser antes del inicio del evento (${formatFullDateTime(eventStart)}).`,
        field: 'classDate',
      });
      return;
    }
    if (eventEnd && parsedDate > new Date(eventEnd)) {
      setState({
        success: false,
        error: `La clase no puede ser después del fin del evento (${formatFullDateTime(eventEnd)}).`,
        field: 'classDate',
      });
      return;
    }

    const coach = coaches.find((c) => c.id === coachId);
    setPreview({
      date,
      capacity,
      type: classType,
      coachName: coach?.username ?? 'Desconocido',
      customName: classType === 'personalizada' ? customNameValue : null,
    });
    setShowConfirm(true);
  }

  function handleConfirm() {
    setShowConfirm(false);
    if (!formRef.current) return;
    const formData = new FormData(formRef.current);
    startTransition(async () => {
      try {
        const result = await addEventClassAction(eventId, formData);
        setState(result);
        if (result.success) {
          formRef.current?.reset();
          setSelectedType('');
          setCustomName('');
        }
      } catch {
        setState({ success: false, error: 'Error al crear la clase. Intenta de nuevo.' });
      }
    });
  }

  function formatDateTime(dateStr: string): string {
    if (!dateStr) return '';
    return formatFullDateTime(parseDateTimeLocalAsMexicoCity(dateStr));
  }

  const minDateTime = toMexicoCityDatetimeLocal(eventStart);
  const maxDateTime = toMexicoCityDatetimeLocal(eventEnd);

  return (
    <>
      <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-5 w-full max-w-md">
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
        <div className="flex flex-col gap-1.5">
          <Input
            id="classDate"
            name="classDate"
            type="datetime-local"
            label="Fecha y hora"
            min={minDateTime || undefined}
            max={maxDateTime || undefined}
            required
            error={state && !state.success && state.field === 'classDate' ? state.error : undefined}
          />
          {(minDateTime || maxDateTime) && (
            <p className="font-body text-xs text-on-surface-variant">
              Debe estar dentro del evento:{' '}
              {eventStart ? formatFullDateTime(eventStart) : '—'} a{' '}
              {eventEnd ? formatFullDateTime(eventEnd) : '—'}
            </p>
          )}
        </div>
        <Input id="capacity" name="capacity" type="number" label="Capacidad" placeholder="1-20" min={1} max={20} required />
        <Select
          id="classType"
          name="classType"
          label="Tipo de clase"
          options={classTypeOptions}
          placeholder="Selecciona un tipo"
          required
          value={selectedType}
          onChange={(e) => {
            const newType = e.target.value;
            setSelectedType(newType);
            if (newType !== 'personalizada') setCustomName('');
          }}
          error={state && !state.success && state.field === 'classType' ? state.error : undefined}
        />
        {selectedType === 'personalizada' && (
          <Input
            id="customName"
            name="customName"
            label="Nombre de la clase"
            maxLength={100}
            required
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            error={state && !state.success && state.field === 'customName' ? state.error : undefined}
          />
        )}

        <button
          type="submit"
          disabled={isPending || disabled}
          className="w-full min-h-11 px-6 py-3 font-semibold uppercase tracking-widest text-label-caps bg-soft-charcoal text-on-primary rounded-DEFAULT transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
        >
          {isPending ? 'Agregando...' : 'Agregar Clase'}
        </button>
      </form>

      <Modal
        isOpen={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={handleConfirm}
        title="Confirmar nueva clase del evento"
        confirmLabel="Sí, agregar clase"
        cancelLabel="Revisar datos"
      >
        {preview && (
          <div className="bg-surface-container-low rounded-lg p-3 space-y-2">
            <div className="flex justify-between gap-3">
              <span className="font-body text-sm text-on-surface-variant">Tipo:</span>
              <span className="font-body text-sm font-semibold text-on-surface">
                {getClassDisplayName(preview.type, preview.customName)}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="font-body text-sm text-on-surface-variant">Coach:</span>
              <span className="font-body text-sm font-semibold text-on-surface">{preview.coachName}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="font-body text-sm text-on-surface-variant">Fecha:</span>
              <span className="font-body text-sm font-semibold text-on-surface capitalize">
                {formatDateTime(preview.date)}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="font-body text-sm text-on-surface-variant">Capacidad:</span>
              <span className="font-body text-sm font-semibold text-on-surface">{preview.capacity} alumnos</span>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
