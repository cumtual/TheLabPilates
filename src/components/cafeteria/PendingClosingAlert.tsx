'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatPesos } from '@/modules/cafeteria/domain/money';
import type { ClosingDetail } from '@/modules/cafeteria/presentation/types';
import { ClosingApprovalModal } from './ClosingApprovalModal';

/** «Tienes un corte de caja pendiente» (SPEC-CAFETERIA D6, §8.2). Sin cortes pendientes no aparece. */
export function PendingClosingAlert({ closings }: { closings: ClosingDetail[] }) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const open = closings.find((c) => c.id === openId) ?? null;

  if (closings.length === 0) return message ? <p role="status" className="rounded-lg bg-primary/10 p-3 font-body text-sm text-primary">{message}</p> : null;

  return (
    <section aria-label="Cortes pendientes" className="rounded-lg border border-warm-wood/40 bg-warm-wood/15 p-4 space-y-3">
      <div className="flex items-start gap-3">
        <span className="material-symbols-outlined text-secondary" aria-hidden="true">
          point_of_sale
        </span>
        <div>
          <p className="font-body text-body-md font-semibold text-on-surface">
            {closings.length === 1 ? 'Tienes un corte de caja pendiente' : `Tienes ${closings.length} cortes de caja pendientes`}
          </p>
          <p className="font-body text-sm text-on-surface-variant">Confirma que recibiste el efectivo para cerrarlo.</p>
        </div>
      </div>
      {message && <p role="status" className="font-body text-sm text-primary">{message}</p>}
      <ul className="space-y-2">
        {closings.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => setOpenId(c.id)}
              className="w-full min-h-11 rounded-lg bg-surface px-3 py-2 text-left font-body text-sm shadow-sm hover:shadow-md"
            >
              {c.createdByName} · {c.ordersCount} pedidos · entrega {formatPesos(c.cashDeliveredCents)} en efectivo — Revisar
            </button>
          </li>
        ))}
      </ul>
      {open && (
        <ClosingApprovalModal
          key={open.id}
          closing={open}
          onClose={() => setOpenId(null)}
          onResolved={(text) => {
            setOpenId(null);
            setMessage(text);
            router.refresh();
          }}
        />
      )}
    </section>
  );
}
