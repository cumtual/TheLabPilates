import type { ReactNode } from 'react';
import { Card } from '@/components/ui/Card';

export type CheckInTone = 'loading' | 'success' | 'error';

const toneStyles: Record<CheckInTone, { icon: string; color: string }> = {
  loading: { icon: 'hourglass_top', color: 'text-on-surface-variant' },
  success: { icon: 'check_circle', color: 'text-primary' },
  error: { icon: 'error', color: 'text-error' },
};

interface CheckInResultCardProps {
  tone: CheckInTone;
  title: string;
  message?: string;
  detail?: string;
  children?: ReactNode;
}

/** Tarjeta de resultado del check-in (mobile-first). Sin estado: sirve en servidor y cliente. */
export function CheckInResultCard({ tone, title, message, detail, children }: CheckInResultCardProps) {
  const { icon, color } = toneStyles[tone];

  return (
    <Card className="w-full max-w-sm text-center">
      <div className="flex flex-col items-center gap-3 py-2">
        <span aria-hidden="true" className={`material-symbols-outlined text-[56px] ${color}`}>
          {icon}
        </span>
        <h1 className="font-headline text-headline-lg-mobile text-on-surface">{title}</h1>
        <div aria-live="polite" className="flex flex-col gap-1">
          {message && <p className={`font-body text-lg font-semibold ${color}`}>{message}</p>}
          {detail && <p className="font-body text-sm text-on-surface-variant capitalize">{detail}</p>}
        </div>
        {children && <div className="flex flex-col gap-3 w-full pt-2">{children}</div>}
      </div>
    </Card>
  );
}

export const checkInLinkClassName =
  'inline-flex items-center justify-center min-h-11 w-full px-6 py-3 rounded-DEFAULT font-body font-semibold bg-soft-charcoal text-on-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';
