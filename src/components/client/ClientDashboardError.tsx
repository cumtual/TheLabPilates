'use client';

import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';

export function ClientDashboardError() {
  const router = useRouter();

  return (
    <div className="space-y-6">
      <h1 className="font-headline text-headline-lg-mobile text-on-surface">Mi Suscripción</h1>

      <Card>
        <div className="space-y-4 text-center">
          <p className="font-body text-sm text-error">
            No se pudo cargar la información de tu suscripción.
          </p>
          <p className="font-body text-sm text-on-surface-variant">
            Verifica tu conexión e intenta de nuevo.
          </p>
          <button
            type="button"
            onClick={() => router.refresh()}
            className="inline-flex items-center justify-center px-6 py-3 font-semibold uppercase tracking-widest text-label-caps bg-soft-charcoal text-on-primary rounded-DEFAULT transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-soft-charcoal min-h-11"
          >
            Reintentar
          </button>
        </div>
      </Card>
    </div>
  );
}
