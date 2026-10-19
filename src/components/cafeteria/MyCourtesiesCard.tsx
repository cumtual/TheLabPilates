import { Card } from '@/components/ui/Card';
import { formatShortDate } from '@/lib/utils/date';
import type { MyCourtesies } from '@/modules/cafeteria/presentation/types';

/**
 * «Mis cortesías» (SPEC-CAFETERIA D12, §8.5): regalos vigentes y cupo mensual del coach.
 * Solo lectura; no se muestra si no hay nada.
 */
export function MyCourtesiesCard({ courtesies }: { courtesies: MyCourtesies }) {
  const { monthly, grants } = courtesies;
  if (!monthly && grants.length === 0) return null;
  return (
    <Card>
      <section aria-label="Mis cortesías" className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-secondary" aria-hidden="true">
            local_cafe
          </span>
          <h2 className="font-body text-sm font-semibold uppercase tracking-wide text-secondary">Mis cortesías</h2>
        </div>
        {monthly && (
          <p className="font-body text-sm text-on-surface">
            Te quedan {monthly.remaining} de {monthly.limit} este mes
          </p>
        )}
        {grants.length > 0 && (
          <ul className="space-y-1">
            {grants.map((g) => (
              <li key={g.id} className="font-body text-sm text-on-surface">
                {g.scopeLabel} · {g.remaining} de {g.quantity}
                {g.expiresAt ? ` · vence ${formatShortDate(g.expiresAt)}` : ''}
              </li>
            ))}
          </ul>
        )}
        <p className="font-body text-xs text-on-surface-variant">Pídelas en la barra al hacer tu pedido.</p>
      </section>
    </Card>
  );
}
