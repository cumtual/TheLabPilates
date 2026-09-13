'use client';

import { useState, useTransition } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { updateClassScheduleAction } from '@/actions/coach';
import { TIMEZONE } from '@/lib/utils/date';

interface EditClassModalProps {
  isOpen: boolean;
  onClose: () => void;
  classId: string;
  classDate: Date | string | null;
  capacity: number | null;
  /** Cupos actualmente ocupados (titulares + invitados activos). */
  occupied: number;
}

/**
 * Convierte un instante a un string compatible con <input type="datetime-local">
 * usando el calendario/reloj de America/Mexico_City.
 */
function toMexicoCityDatetimeLocal(date: Date | string | null): string {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const hour = get('hour') === '24' ? '00' : get('hour');

  return `${get('year')}-${get('month')}-${get('day')}T${hour}:${get('minute')}`;
}

/**
 * Modal de edición restringido a fecha/hora y cupos.
 * NO expone ninguna acción de cancelación (privilegio exclusivo del admin).
 */
export function EditClassModal({
  isOpen,
  onClose,
  classId,
  classDate,
  capacity,
  occupied,
}: EditClassModalProps) {
  // Este componente se monta por clase (ver `key` en los padres), por lo que el
  // estado inicial se deriva una sola vez de las props sin necesidad de useEffect.
  const [dateValue, setDateValue] = useState(() => toMexicoCityDatetimeLocal(classDate));
  const [capacityValue, setCapacityValue] = useState(() =>
    capacity != null ? String(capacity) : ''
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    if (isPending) return;
    setError(null);

    startTransition(async () => {
      const result = await updateClassScheduleAction(classId, {
        classDate: dateValue,
        capacity: capacityValue,
      });

      if (result.success) {
        onClose();
      } else {
        setError(result.error);
      }
    });
  }

  const capacityNum = parseInt(capacityValue, 10);
  const capacityBelowOccupied =
    capacityValue !== '' && (isNaN(capacityNum) || capacityNum < occupied);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={handleConfirm}
      title="Editar Clase"
      confirmLabel={isPending ? 'Guardando…' : 'Guardar cambios'}
      cancelLabel="Volver"
    >
      <div className="space-y-5">
        <Input
          id="edit-class-date"
          type="datetime-local"
          label="Fecha y hora (hora de Ciudad de México)"
          value={dateValue}
          onChange={(e) => setDateValue(e.target.value)}
          required
        />

        <div>
          <Input
            id="edit-class-capacity"
            type="number"
            label="Cupos / Capacidad"
            min={Math.max(1, occupied)}
            max={20}
            value={capacityValue}
            onChange={(e) => setCapacityValue(e.target.value)}
            disabled={isPending}
            error={capacityBelowOccupied ? 'La capacidad no puede ser menor a los cupos ocupados.' : undefined}
            required
          />
          <p className="font-body text-[13px] text-on-surface-variant mt-2">
            Cupos ocupados actuales: {occupied}. La capacidad no puede ser menor a {occupied}.
          </p>
        </div>

        {error && (
          <p role="alert" className="font-body text-sm text-error">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
