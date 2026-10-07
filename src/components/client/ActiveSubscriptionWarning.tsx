'use client';

import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import Link from 'next/link';

interface ActiveSubscriptionWarningProps {
  /** Nombre del paquete vigente. */
  packageName?: string | null;
  credits: number;
  expiration: string | null;
  isOpenLab?: boolean;
}

/**
 * Aviso previo a comprar otro paquete (SPEC-SPECIAL-PACKAGES §6.2, D2, S1, S3): al
 * confirmarse el pago del nuevo paquete, el vigente vence y pierde sus créditos.
 */
export function ActiveSubscriptionWarning({ packageName, credits, expiration, isOpenLab = false }: ActiveSubscriptionWarningProps) {
  const current = [
    packageName ?? 'tu paquete',
    isOpenLab ? 'clases ilimitadas' : `${credits} ${credits === 1 ? 'crédito' : 'créditos'}`,
    expiration ? `vence ${expiration}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Card className="border-primary/30 bg-primary/5">
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary text-[24px]">info</span>
          <h2 className="font-body text-base font-semibold text-on-surface">
            Ya cuentas con una suscripción activa
          </h2>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <span className="font-body text-sm text-on-surface-variant">
              {isOpenLab ? 'Clases:' : 'Créditos disponibles:'}
            </span>
            <Badge variant="active">
              {isOpenLab ? 'Ilimitadas' : `${credits} sesiones`}
            </Badge>
          </div>
          {expiration && (
            <div className="flex items-center gap-3">
              <span className="font-body text-sm text-on-surface-variant">Vence:</span>
              <span className="font-body text-sm font-medium text-on-surface">{expiration}</span>
            </div>
          )}
        </div>

        <p className="font-body text-sm text-on-surface-variant">
          Al confirmarse el pago de tu nuevo paquete, tu suscripción actual ({current}) pasará a vencida y los
          créditos restantes <strong>no</strong> se reembolsan ni se transfieren. Tus reservas ya hechas se mantienen.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <Link
            href="/client/subscription?continue=1"
            className="inline-flex items-center justify-center px-5 py-3 min-h-11 font-body text-sm font-semibold uppercase tracking-wider bg-soft-charcoal text-on-primary rounded-lg transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lg"
          >
            Sí, deseo comprar otro paquete
          </Link>
          <Link
            href="/client"
            className="inline-flex items-center justify-center px-5 py-3 min-h-11 font-body text-sm font-medium text-on-surface-variant bg-surface-container-low border border-outline-variant rounded-lg transition-colors hover:bg-surface-container-high"
          >
            Volver al dashboard
          </Link>
        </div>
      </div>
    </Card>
  );
}
