'use client';

import { useEffect, useRef, useState } from 'react';
import { Modal } from '@/components/ui/Modal';

export interface BankInfo {
  cardName: string;
  cardNumber: string;
  cardBank: string;
}

interface BankTransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  concept: string;
  amount: number;
  bank: BankInfo | null;
}

interface CopyField {
  key: string;
  label: string;
  value: string;
}

export function BankTransferModal({
  isOpen,
  onClose,
  concept,
  amount,
  bank,
}: BankTransferModalProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  async function handleCopy(field: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setCopiedField(null), 2000);
    } catch {
      // Clipboard API unavailable (e.g. insecure context); silently ignore.
    }
  }

  const fields: CopyField[] = bank
    ? [
        { key: 'bank', label: 'Banco', value: bank.cardBank },
        { key: 'holder', label: 'Titular / Beneficiario', value: bank.cardName },
        { key: 'account', label: 'Cuenta / CLABE', value: bank.cardNumber },
      ]
    : [];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={onClose}
      title="Datos de transferencia"
      confirmLabel="Cerrar"
      hideCancel
    >
      <div className="space-y-4">
        <div className="space-y-1">
          <p className="font-body text-sm text-on-surface-variant">{concept}</p>
          <p className="font-body text-lg font-semibold text-on-surface">
            Monto a transferir: ${amount} MXN
          </p>
        </div>

        {bank ? (
          <div className="rounded-DEFAULT border border-outline-variant/40 bg-surface-container-low p-3 space-y-3">
            {fields.map((field) => (
              <div key={field.key} className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-body text-xs text-outline">{field.label}</p>
                  <p className="font-body text-sm font-semibold text-on-surface break-words">
                    {field.value}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopy(field.key, field.value)}
                  className="shrink-0 min-h-9 px-3 py-1.5 font-body text-xs font-semibold text-soft-charcoal border border-outline-variant rounded-DEFAULT transition-colors hover:bg-surface-container-high focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  {copiedField === field.key ? 'Copiado' : 'Copiar'}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="font-body text-sm text-on-surface-variant">
            No hay datos bancarios configurados. Contacta al administrador.
          </p>
        )}

        <p className="font-body text-sm text-on-surface-variant">
          Envía tu comprobante por mensaje directo a nuestro Instagram{' '}
          <a
            href="https://www.instagram.com/thelabpilates.hpjn/"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-primary underline underline-offset-2"
          >
            @thelabpilates.hpjn
          </a>
          .
        </p>

        <p className="font-body text-sm text-on-surface-variant">
          Tu pago será verificado por el administrador. Una vez confirmado, se activará tu
          suscripción o se garantizará tu lugar.
        </p>
      </div>
    </Modal>
  );
}
