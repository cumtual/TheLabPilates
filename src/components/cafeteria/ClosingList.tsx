'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/Badge';
import { formatAuditDateTime } from '@/lib/utils/date';
import { CLOSING_STATUS_LABELS } from '@/modules/cafeteria/domain/closing';
import { formatPesos } from '@/modules/cafeteria/domain/money';
import { retryClosingEmailAction } from '@/modules/cafeteria/presentation/actions/admin';
import type { ClosingView } from '@/modules/cafeteria/presentation/types';

/** Historial de cortes (SPEC-CAFETERIA §8.2): estado, faltantes y correos fallidos con reintento. */
export function ClosingList({ closings }: { closings: ClosingView[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  function retry(closingId: string, which: 'created' | 'resolved') {
    startTransition(async () => {
      const result = await retryClosingEmailAction({ closingId, which });
      if (result.success && result.data.emailSent) {
        setMessage({ ok: true, text: 'Correo enviado.' });
        router.refresh();
      } else {
        setMessage({ ok: false, text: result.success ? 'El correo volvió a fallar.' : result.error });
      }
    });
  }

  if (closings.length === 0) return <p className="font-body text-body-md text-on-surface-variant py-10 text-center">Aún no hay cortes.</p>;

  return (
    <div className="space-y-3">
      {message && (
        <p role="status" className={`font-body text-sm ${message.ok ? 'text-primary' : 'text-error'}`}>
          {message.text}
        </p>
      )}
      <ul className="space-y-3">
        {closings.map((c) => {
          const failed = (['created', 'resolved'] as const).filter((w) => (w === 'created' ? c.createdEmailStatus : c.resolvedEmailStatus) === 'failed');
          return (
            <li key={c.id} data-testid={`closing-${c.id}`} className="rounded-lg bg-surface p-4 shadow-sm space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-body text-sm font-semibold text-on-surface">{formatAuditDateTime(c.createdAt)}</span>
                <Badge variant={c.status === 'pending' ? 'pending' : c.status === 'approved' ? 'confirmed' : 'expired'}>{CLOSING_STATUS_LABELS[c.status]}</Badge>
                {(c.shortfallCents ?? 0) > 0 && <span className="font-body text-xs font-semibold text-error">Faltante {formatPesos(c.shortfallCents ?? 0)}</span>}
              </div>
              <p className="font-body text-sm text-on-surface-variant">
                {c.createdByName} · {c.ordersCount} pedidos · efectivo {formatPesos(c.cashTotalCents)} (entregó {formatPesos(c.cashDeliveredCents)}
                {c.cashReceivedCents !== null ? `, recibido ${formatPesos(c.cashReceivedCents)}` : ''}) · transferencias {formatPesos(c.transferTotalCents)}
              </p>
              {c.resolutionNote && <p className="font-body text-xs text-on-surface-variant">Nota: {c.resolutionNote}</p>}
              {failed.map((which) => (
                <div key={which} className="flex items-center gap-2">
                  <span className="font-body text-xs text-error">Correo {which === 'created' ? 'del corte' : 'de cierre'} no enviado</span>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => retry(c.id, which)}
                    className="min-h-11 px-3 font-body text-sm text-primary underline underline-offset-2 disabled:opacity-50"
                  >
                    Reintentar
                  </button>
                </div>
              ))}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
