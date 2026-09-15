'use client';

import { useState, useRef, useTransition } from 'react';
import { createSpecialEventAction } from '@/actions/admin-events';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { parseDateTimeLocalAsMexicoCity, formatFullDateTime } from '@/lib/utils/date';
import type { ActionResult } from '@/lib/types';

interface SubscriptionOption {
  id: string;
  name: string | null;
}

interface CreateSpecialEventFormProps {
  subscriptions: SubscriptionOption[];
  /** True when an active event already exists — form is disabled. */
  disabled?: boolean;
}

interface PreviewData {
  title: string;
  shortDescription: string;
  price: string;
  startDate: string;
  endDate: string;
  discounts: { name: string; amount: string }[];
}

function formatPreviewDate(dateStr: string): string {
  if (!dateStr) return '';
  return formatFullDateTime(parseDateTimeLocalAsMexicoCity(dateStr));
}

export function CreateSpecialEventForm({ subscriptions, disabled = false }: CreateSpecialEventFormProps) {
  const [state, setState] = useState<ActionResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const [showConfirm, setShowConfirm] = useState(false);
  const [shortDescription, setShortDescription] = useState('');
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    const title = (formData.get('title') as string) ?? '';
    const desc = (formData.get('description') as string) ?? '';
    const short = (formData.get('shortDescription') as string) ?? '';
    const price = (formData.get('price') as string) ?? '';
    const startDate = (formData.get('startDate') as string) ?? '';
    const endDate = (formData.get('endDate') as string) ?? '';

    if (!title.trim() || !desc.trim() || !short.trim() || !price || !startDate || !endDate) {
      setState({ success: false, error: 'Todos los campos son obligatorios.' });
      return;
    }

    const discounts = subscriptions
      .map((sub) => ({
        name: sub.name ?? 'Membresía',
        amount: (formData.get(`discount_${sub.id}`) as string) ?? '',
      }))
      .filter((d) => d.amount.trim() !== '');

    setPreview({ title, shortDescription: short, price, startDate, endDate, discounts });
    setShowConfirm(true);
  }

  function handleConfirm() {
    setShowConfirm(false);
    if (!formRef.current) return;

    const formData = new FormData(formRef.current);
    startTransition(async () => {
      try {
        const result = await createSpecialEventAction(formData);
        setState(result);
        if (result.success) {
          formRef.current?.reset();
          setShortDescription('');
        }
      } catch {
        setState({ success: false, error: 'Error al crear el evento. Intenta de nuevo.' });
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

        <Input id="title" name="title" label="Nombre del evento" maxLength={120} required />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="description" className="font-body text-body-md font-semibold text-on-surface">
            Descripción <span className="text-error">*</span>
          </label>
          <textarea
            id="description"
            name="description"
            rows={4}
            required
            className="w-full px-4 py-3 font-body text-body-md text-on-surface bg-surface border border-outline-variant rounded-DEFAULT placeholder:text-outline transition-colors focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            placeholder="Descripción completa del evento"
          />
        </div>

        <Input
          id="shortDescription"
          name="shortDescription"
          label="Descripción breve (landing, máx. 150)"
          maxLength={150}
          value={shortDescription}
          onChange={(e) => setShortDescription(e.target.value)}
          required
        />

        <Input id="price" name="price" type="number" label="Precio (MXN)" min={1} required />

        <Input id="startDate" name="startDate" type="datetime-local" label="Inicio del evento" required />
        <Input id="endDate" name="endDate" type="datetime-local" label="Fin del evento" required />

        <fieldset className="space-y-3 rounded-lg border border-outline-variant/40 p-4">
          <legend className="font-body text-body-md font-semibold text-on-surface px-1">
            Descuentos por membresía (opcional, MXN)
          </legend>
          {subscriptions.length === 0 ? (
            <p className="font-body text-sm text-on-surface-variant">No hay membresías configuradas.</p>
          ) : (
            subscriptions.map((sub) => (
              <Input
                key={sub.id}
                id={`discount_${sub.id}`}
                name={`discount_${sub.id}`}
                type="number"
                label={sub.name ?? 'Membresía'}
                min={0}
                placeholder="Sin descuento"
              />
            ))
          )}
        </fieldset>

        <label className="flex items-center gap-3 font-body text-body-md text-on-surface">
          <input type="checkbox" name="showOnLanding" defaultChecked className="h-5 w-5" />
          Mostrar en la landing page
        </label>

        <button
          type="submit"
          disabled={isPending || disabled}
          className="w-full min-h-11 px-6 py-3 font-semibold uppercase tracking-widest text-label-caps bg-soft-charcoal text-on-primary rounded-DEFAULT transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
        >
          {isPending ? 'Creando...' : 'Crear Evento Especial'}
        </button>
      </form>

      <Modal
        isOpen={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={handleConfirm}
        title="Confirmar publicación de evento"
        confirmLabel="Sí, publicar evento"
        cancelLabel="Revisar datos"
        variant="default"
      >
        <div className="space-y-3">
          <p>¿Deseas publicar este evento especial?</p>
          {preview && (
            <div className="bg-surface-container-low rounded-lg p-3 space-y-2">
              <div className="flex justify-between gap-3">
                <span className="font-body text-sm text-on-surface-variant">Evento:</span>
                <span className="font-body text-sm font-semibold text-on-surface text-right">{preview.title}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="font-body text-sm text-on-surface-variant">Fechas:</span>
                <span className="font-body text-sm font-semibold text-on-surface text-right capitalize">
                  {formatPreviewDate(preview.startDate)} — {formatPreviewDate(preview.endDate)}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="font-body text-sm text-on-surface-variant">Precio:</span>
                <span className="font-body text-sm font-semibold text-on-surface">${preview.price} MXN</span>
              </div>
              {preview.discounts.length > 0 && (
                <div className="space-y-1 border-t border-outline-variant/40 pt-2">
                  <p className="font-body text-xs font-semibold text-on-surface uppercase tracking-wide">
                    Descuentos
                  </p>
                  {preview.discounts.map((d) => (
                    <div key={d.name} className="flex justify-between gap-3">
                      <span className="font-body text-sm text-on-surface-variant">{d.name}:</span>
                      <span className="font-body text-sm font-semibold text-on-surface">-${d.amount} MXN</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <p className="text-sm text-on-surface-variant">
            La descripción breve: <span className="italic">{preview?.shortDescription}</span>
          </p>
        </div>
      </Modal>
    </>
  );
}
