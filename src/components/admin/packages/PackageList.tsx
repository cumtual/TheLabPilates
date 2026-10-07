'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { setPackageActiveAction, softDeletePackageAction } from '@/actions/admin-packages';
import type { AdminPackageView } from '@/lib/queries/packages';

interface PackageListProps {
  packages: AdminPackageView[];
}

/** Catálogo de paquetes del admin (SPEC-SPECIAL-PACKAGES §7.2). Una fila por paquete, responsiva. */
export function PackageList({ packages }: PackageListProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [toDelete, setToDelete] = useState<AdminPackageView | null>(null);

  function run(action: () => Promise<{ success: boolean; message?: string; error?: string }>) {
    startTransition(async () => {
      const result = await action();
      setMessage(result.success ? { ok: true, text: result.message ?? 'Listo.' } : { ok: false, text: result.error ?? 'Error.' });
      if (result.success) router.refresh();
    });
  }

  function confirmDelete() {
    if (!toDelete) return;
    const { id } = toDelete;
    setToDelete(null);
    run(() => softDeletePackageAction(id));
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Link
          href="/admin/packages/new"
          className="inline-flex items-center gap-2 min-h-11 px-6 py-3 font-semibold uppercase tracking-widest text-label-caps bg-soft-charcoal text-on-primary rounded-DEFAULT hover:shadow-lg transition-all"
        >
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">add</span>
          Nuevo paquete
        </Link>
      </div>

      {message && (
        <p role="status" className={`font-body text-sm ${message.ok ? 'text-primary' : 'text-error'}`}>
          {message.text}
        </p>
      )}

      {packages.length === 0 ? (
        <p className="font-body text-body-md text-on-surface-variant text-center py-10">Aún no hay paquetes.</p>
      ) : (
        <ul className="space-y-3">
          {packages.map((pkg) => (
            <li
              key={pkg.id}
              data-testid={`package-${pkg.id}`}
              className="bg-surface rounded-lg border border-outline-variant/40 shadow-sm p-4 md:grid md:grid-cols-[3rem_1fr_6rem_10rem_6rem_6rem_auto] md:items-center md:gap-4 space-y-2 md:space-y-0"
            >
              <span className="font-body text-sm text-outline">#{pkg.displayOrder}</span>
              <div className="min-w-0">
                <p className="font-headline text-lg text-on-surface truncate">{pkg.name}</p>
                <Badge variant={pkg.kind === 'special' ? 'pending' : 'confirmed'}>
                  {pkg.kind === 'special' ? 'Especial' : 'Estándar'}
                </Badge>
              </div>
              <span className="font-body text-body-md text-on-surface">${pkg.priceLabel}</span>
              <span className="font-body text-sm text-on-surface-variant">{pkg.validityLabel}</span>
              <span className="font-body text-sm text-on-surface-variant">
                {pkg.salesCount} {pkg.salesCount === 1 ? 'venta' : 'ventas'}
              </span>
              <Badge variant={pkg.isActive ? 'active' : 'expired'}>{pkg.isActive ? 'Activo' : 'Inactivo'}</Badge>
              <div className="flex flex-wrap gap-2 md:justify-end">
                <Link
                  href={`/admin/packages/${pkg.id}/edit`}
                  className="min-h-11 inline-flex items-center px-3 font-body text-sm text-primary underline underline-offset-2"
                >
                  Editar
                </Link>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => run(() => setPackageActiveAction(pkg.id, !pkg.isActive))}
                  className="min-h-11 px-3 font-body text-sm border border-outline-variant rounded-DEFAULT hover:bg-surface-container-low disabled:opacity-50"
                >
                  {pkg.isActive ? 'Desactivar' : 'Activar'}
                </button>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => setToDelete(pkg)}
                  className="min-h-11 px-3 font-body text-sm text-error border border-error/30 rounded-DEFAULT hover:bg-error/10 disabled:opacity-50"
                >
                  Eliminar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal
        isOpen={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        title={`Eliminar ${toDelete?.name ?? 'paquete'}`}
        confirmLabel="Sí, eliminar"
        cancelLabel="Cancelar"
        variant="danger"
      >
        <p>El paquete dejará de mostrarse en la landing y en la tienda. Las suscripciones ya vendidas no cambian.</p>
      </Modal>
    </div>
  );
}
