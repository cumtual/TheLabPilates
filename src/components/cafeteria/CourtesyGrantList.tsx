'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { formatAuditDateTime, formatShortDate } from '@/lib/utils/date';
import { GRANT_STATUS_LABELS, type GrantStatus } from '@/modules/cafeteria/domain/courtesy-grants';
import { revokeCourtesyAction } from '@/modules/cafeteria/presentation/actions/admin';
import type { GrantListItem } from '@/modules/cafeteria/presentation/types';

const BADGE: Record<GrantStatus, 'active' | 'pending' | 'expired' | 'confirmed'> = {
  active: 'active',
  used: 'confirmed',
  expired: 'expired',
  revoked: 'expired',
  unavailable: 'pending',
};

/** Regalos de cortesía (SPEC-CAFETERIA D11, A12, A13, §8.2): estado, uso y revocación. */
export function CourtesyGrantList({ grants }: { grants: GrantListItem[] }) {
  const router = useRouter();
  const [status, setStatus] = useState<GrantStatus | 'all'>('all');
  const [query, setQuery] = useState('');
  const [toRevoke, setToRevoke] = useState<GrantListItem | null>(null);
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return grants.filter((g) => (status === 'all' || g.status === status) && (q === '' || g.userName.toLowerCase().includes(q) || g.userEmail.toLowerCase().includes(q)));
  }, [grants, status, query]);

  function revoke() {
    const grant = toRevoke;
    if (!grant || reason.trim() === '') return;
    setToRevoke(null);
    startTransition(async () => {
      const result = await revokeCourtesyAction({ grantId: grant.id, reason: reason.trim() });
      setMessage(result.success ? { ok: true, text: 'Regalo revocado.' } : { ok: false, text: result.error });
      setReason('');
      if (result.success) router.refresh();
    });
  }

  return (
    <section aria-label="Regalos" className="space-y-3">
      <h2 className="font-headline text-lg text-on-surface">Regalos</h2>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input aria-label="Buscar por usuario" placeholder="Nombre o correo" value={query} onChange={(e) => setQuery(e.target.value)} className="flex-1 min-h-11 px-3 rounded-lg border border-outline-variant bg-surface" />
        <select aria-label="Estado" value={status} onChange={(e) => setStatus(e.target.value as GrantStatus | 'all')} className="min-h-11 px-3 rounded-lg border border-outline-variant bg-surface">
          <option value="all">Todos</option>
          {(Object.keys(GRANT_STATUS_LABELS) as GrantStatus[]).map((s) => (
            <option key={s} value={s}>
              {GRANT_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>
      {message && (
        <p role="status" className={`font-body text-sm ${message.ok ? 'text-primary' : 'text-error'}`}>
          {message.text}
        </p>
      )}
      {visible.length === 0 ? (
        <p className="font-body text-sm text-on-surface-variant py-6 text-center">Sin regalos.</p>
      ) : (
        <ul className="space-y-2">
          {visible.map((g) => (
            <li key={g.id} data-testid={`grant-${g.id}`} className="rounded-lg bg-surface p-3 shadow-sm space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-body text-sm font-semibold">{g.userName}</span>
                <span className="font-body text-xs text-outline">{g.userEmail}</span>
                <Badge variant={BADGE[g.status]}>{GRANT_STATUS_LABELS[g.status]}</Badge>
              </div>
              <p className="font-body text-sm text-on-surface">
                {g.scopeLabel} · usadas {g.redeemed} de {g.quantity}
                {g.expiresAt ? ` · vence ${formatShortDate(g.expiresAt)}` : ' · sin vencimiento'}
              </p>
              <p className="font-body text-xs text-on-surface-variant">
                Regaló {g.grantedByName} el {formatAuditDateTime(g.createdAt)}
                {g.note ? ` · ${g.note}` : ''}
                {g.revokeReason ? ` · Revocado: ${g.revokeReason}` : ''}
              </p>
              {g.status === 'active' && (
                <button type="button" onClick={() => setToRevoke(g)} className="min-h-11 px-2 font-body text-sm text-error">
                  Revocar
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <Modal
        isOpen={toRevoke !== null}
        onClose={() => {
          setToRevoke(null);
          setReason('');
        }}
        onConfirm={revoke}
        title="Revocar cortesías"
        confirmLabel="Sí, revocar"
        variant="danger"
        confirmDisabled={reason.trim() === '' || isPending}
      >
        <p className="text-sm">
          {toRevoke?.userName} · {toRevoke?.scopeLabel} · le quedan {toRevoke?.remaining}. Lo ya canjeado no cambia.
        </p>
        <label htmlFor="revoke-reason" className="mt-3 block text-sm font-semibold text-on-surface">
          Motivo (obligatorio)
        </label>
        <textarea id="revoke-reason" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 w-full min-h-16 px-3 py-2 rounded-lg border border-outline-variant bg-surface text-sm" />
      </Modal>
    </section>
  );
}
