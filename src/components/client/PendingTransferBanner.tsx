'use client';

import { useState } from 'react';
import { BankTransferModal, type BankInfo } from '@/components/client/BankTransferModal';
import type { PendingTransfer } from '@/lib/queries/pending-transfers';

interface PendingTransferBannerProps {
  transfers: PendingTransfer[];
  bank: BankInfo | null;
}

export function PendingTransferBanner({ transfers, bank }: PendingTransferBannerProps) {
  const [activeTransfer, setActiveTransfer] = useState<PendingTransfer | null>(null);

  if (transfers.length === 0) return null;

  return (
    <>
      <div className="space-y-3">
        {transfers.map((transfer, index) => (
          <div
            key={`${transfer.kind}-${transfer.concept}-${index}`}
            className="p-4 rounded-lg bg-warm-wood/10 border border-warm-wood/30"
          >
            <div className="flex items-start gap-3">
              <span className="material-symbols-outlined text-warm-wood text-[24px]">
                account_balance
              </span>
              <div className="flex-1 space-y-2">
                <p className="font-body text-body-md text-on-surface font-semibold">
                  Tienes un pago pendiente por transferencia para {transfer.concept}.
                </p>
                <p className="font-body text-body-md text-on-surface-variant">
                  Monto a transferir:{' '}
                  <span className="font-semibold text-on-surface">
                    ${transfer.amount} MXN
                  </span>
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTransfer(transfer)}
                  className="inline-flex items-center justify-center min-h-11 px-5 py-3 font-body text-sm font-semibold uppercase tracking-wider bg-soft-charcoal text-on-primary rounded-DEFAULT transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-soft-charcoal"
                >
                  Ver datos de transferencia
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <BankTransferModal
        isOpen={activeTransfer !== null}
        onClose={() => setActiveTransfer(null)}
        concept={activeTransfer?.concept ?? ''}
        amount={activeTransfer?.amount ?? 0}
        bank={bank}
      />
    </>
  );
}
