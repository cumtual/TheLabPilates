import { Card } from '@/components/ui/Card';
import type { CreditBalanceView } from '@/lib/subscription/package-view';

interface CreditBalancesProps {
  packageName: string;
  expirationDate: string;
  totalRemaining: number;
  balances: CreditBalanceView[];
  guestCredits: { available: number; total: number } | null;
}

/** Desglose de créditos de un paquete especial (SPEC-SPECIAL-PACKAGES §8.1). */
export function CreditBalances({ packageName, expirationDate, totalRemaining, balances, guestCredits }: CreditBalancesProps) {
  return (
    <Card>
      <div className="space-y-4">
        <div>
          <h2 className="font-body text-lg font-semibold text-on-surface">Tus créditos</h2>
          <p className="font-body text-sm text-outline">
            {packageName} · Vence {expirationDate}
          </p>
        </div>

        <p className="font-headline text-2xl text-on-surface">
          {totalRemaining === 1 ? 'Te queda 1 clase' : `Te quedan ${totalRemaining} clases`}
        </p>

        <ul className="space-y-2">
          {balances.map((balance) => (
            <li
              key={balance.balanceId}
              className={`flex items-start gap-3 rounded-lg bg-surface-container-low p-3 ${balance.exhausted ? 'opacity-60' : ''}`}
            >
              <span className="material-symbols-outlined text-[20px] text-primary" aria-hidden="true">
                fitness_center
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-body text-body-md text-on-surface">
                  {balance.exhausted ? `0 de ${balance.total} · ${balance.label}` : balance.summary}
                </p>
                {balance.timeWindow && (
                  <p className="font-body text-[13px] text-on-surface-variant">
                    Solo de {balance.timeWindow.replace('–', ' a ')}
                  </p>
                )}
              </div>
              {balance.exhausted && (
                <span className="font-body text-[11px] uppercase tracking-widest text-outline">Usada</span>
              )}
            </li>
          ))}
        </ul>

        {guestCredits && (
          <p className="font-body text-sm text-on-surface-variant">
            {guestCredits.available} de {guestCredits.total} pases de invitado
          </p>
        )}
      </div>
    </Card>
  );
}
