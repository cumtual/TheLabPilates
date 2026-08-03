'use client';

import { useState, useTransition } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { Pagination } from '@/components/ui/Pagination';
import {
  suspendSubscriptionAction,
  reactivateSubscriptionAction,
  refundSessionCreditAction,
} from '@/actions/admin';

const PAGE_SIZE = 10;

interface SubscriptionItem {
  subscriptionId: string;
  userId: string;
  clientName: string;
  clientEmail: string;
  subscriptionName: string | null;
  daysRemaining: number | null;
  expirationDate: string | null;
  active: boolean;
}

interface SubscriptionManagementProps {
  subscriptions: SubscriptionItem[];
}

type StatusFilter = 'all' | 'active' | 'suspended';

const filterLabels: Record<StatusFilter, string> = {
  all: 'Todas',
  active: 'Activas',
  suspended: 'Suspendidas',
};

export function SubscriptionManagement({ subscriptions }: SubscriptionManagementProps) {
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  // Confirmation modals
  const [confirmSuspendId, setConfirmSuspendId] = useState<string | null>(null);
  const [confirmRefundUserId, setConfirmRefundUserId] = useState<string | null>(null);
  const [confirmRefundName, setConfirmRefundName] = useState<string>('');

  // Track local state changes
  const [localActiveState, setLocalActiveState] = useState<Record<string, boolean>>({});

  function getActiveState(sub: SubscriptionItem): boolean {
    return localActiveState[sub.subscriptionId] ?? sub.active;
  }

  // Filter
  const filteredSubscriptions = subscriptions.filter((sub) => {
    const isActive = getActiveState(sub);
    if (filter === 'active') return isActive;
    if (filter === 'suspended') return !isActive;
    return true;
  });

  const totalPages = Math.ceil(filteredSubscriptions.length / PAGE_SIZE);
  const paginatedSubscriptions = filteredSubscriptions.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE
  );

  const counts: Record<StatusFilter, number> = {
    all: subscriptions.length,
    active: subscriptions.filter((s) => getActiveState(s)).length,
    suspended: subscriptions.filter((s) => !getActiveState(s)).length,
  };

  // Actions
  function handleSuspendConfirm() {
    if (!confirmSuspendId) return;
    setError(null);
    setSuccessMessage(null);
    setPendingAction(`suspend-${confirmSuspendId}`);
    const id = confirmSuspendId;
    setConfirmSuspendId(null);

    startTransition(async () => {
      const result = await suspendSubscriptionAction(id);
      if (result.success) {
        setLocalActiveState((prev) => ({ ...prev, [id]: false }));
        setSuccessMessage(result.message ?? 'Suscripción suspendida.');
      } else {
        setError(result.error);
      }
      setPendingAction(null);
    });
  }

  function handleReactivate(subscriptionId: string) {
    setError(null);
    setSuccessMessage(null);
    setPendingAction(`reactivate-${subscriptionId}`);

    startTransition(async () => {
      const result = await reactivateSubscriptionAction(subscriptionId);
      if (result.success) {
        setLocalActiveState((prev) => ({ ...prev, [subscriptionId]: true }));
        setSuccessMessage(result.message ?? 'Suscripción reactivada.');
      } else {
        setError(result.error);
      }
      setPendingAction(null);
    });
  }

  function handleRefundConfirm() {
    if (!confirmRefundUserId) return;
    setError(null);
    setSuccessMessage(null);
    setPendingAction(`refund-${confirmRefundUserId}`);
    const userId = confirmRefundUserId;
    setConfirmRefundUserId(null);
    setConfirmRefundName('');

    startTransition(async () => {
      const result = await refundSessionCreditAction(userId);
      if (result.success) {
        setSuccessMessage(result.message ?? 'Crédito otorgado.');
      } else {
        setError(result.error);
      }
      setPendingAction(null);
    });
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {(Object.keys(filterLabels) as StatusFilter[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => { setFilter(key); setPage(1); }}
            className={`inline-flex items-center gap-1.5 px-3 py-2 min-h-11 rounded-lg font-body text-sm font-medium transition-colors ${
              filter === key
                ? 'bg-primary text-on-primary'
                : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high'
            }`}
          >
            {filterLabels[key]}
            <span className={`text-xs px-1.5 py-0.5 rounded-full ${
              filter === key
                ? 'bg-on-primary/20 text-on-primary'
                : 'bg-outline-variant/30 text-outline'
            }`}>
              {counts[key]}
            </span>
          </button>
        ))}
      </div>

      {/* Messages */}
      {error && (
        <div className="bg-error/10 border border-error/30 rounded-lg p-3">
          <p className="font-body text-sm text-error">{error}</p>
        </div>
      )}
      {successMessage && (
        <div className="bg-primary/10 border border-primary/30 rounded-lg p-3">
          <p className="font-body text-sm text-primary">{successMessage}</p>
        </div>
      )}

      {/* List */}
      {filteredSubscriptions.length === 0 ? (
        <Card>
          <p className="font-body text-sm text-outline text-center py-8">
            {filter === 'all'
              ? 'No hay suscripciones registradas.'
              : `No hay suscripciones ${filterLabels[filter].toLowerCase()}.`}
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {paginatedSubscriptions.map((sub) => {
            const isActive = getActiveState(sub);

            return (
              <Card key={sub.subscriptionId}>
                <div className="flex flex-col gap-3">
                  <div className="space-y-1">
                    <p className="font-body text-sm font-semibold text-on-surface">
                      {sub.clientName}
                    </p>
                    <p className="font-body text-xs text-outline">
                      {sub.clientEmail}
                    </p>
                    {sub.subscriptionName && (
                      <p className="font-body text-xs text-on-surface-variant">
                        Plan: {sub.subscriptionName}
                      </p>
                    )}
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant={isActive ? 'confirmed' : 'cancelled'}>
                        {isActive ? 'Activa' : 'Suspendida'}
                      </Badge>
                      <span className="font-body text-sm text-on-surface">
                        Créditos: {sub.daysRemaining ?? 0}
                      </span>
                      {sub.expirationDate && (
                        <span className="font-body text-xs text-outline">
                          Vence: {sub.expirationDate}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row">
                    {isActive ? (
                      <>
                        <button
                          type="button"
                          onClick={() => setConfirmSuspendId(sub.subscriptionId)}
                          disabled={isPending && pendingAction === `suspend-${sub.subscriptionId}`}
                          className="inline-flex items-center justify-center px-4 py-3 font-body text-sm font-semibold uppercase tracking-wider bg-error text-on-primary rounded-lg transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed min-h-11 min-w-11"
                        >
                          {isPending && pendingAction === `suspend-${sub.subscriptionId}`
                            ? 'Suspendiendo...'
                            : 'Suspender'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmRefundUserId(sub.userId);
                            setConfirmRefundName(sub.clientName);
                          }}
                          disabled={isPending && pendingAction === `refund-${sub.userId}`}
                          className="inline-flex items-center justify-center px-4 py-3 font-body text-sm font-semibold uppercase tracking-wider bg-primary text-on-primary rounded-lg transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed min-h-11 min-w-11"
                        >
                          {isPending && pendingAction === `refund-${sub.userId}`
                            ? 'Otorgando...'
                            : 'Otorgar Crédito'}
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleReactivate(sub.subscriptionId)}
                        disabled={isPending && pendingAction === `reactivate-${sub.subscriptionId}`}
                        className="inline-flex items-center justify-center px-4 py-3 font-body text-sm font-semibold uppercase tracking-wider bg-primary text-on-primary rounded-lg transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed min-h-11 min-w-11"
                      >
                        {isPending && pendingAction === `reactivate-${sub.subscriptionId}`
                          ? 'Reactivando...'
                          : 'Reactivar'}
                      </button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      <Pagination currentPage={page} totalPages={totalPages} onChange={setPage} />

      {/* Suspend Confirmation Modal */}
      <Modal
        isOpen={confirmSuspendId !== null}
        onClose={() => setConfirmSuspendId(null)}
        onConfirm={handleSuspendConfirm}
        title="Suspender suscripción"
        confirmLabel="Sí, suspender"
        cancelLabel="Cancelar"
        variant="danger"
      >
        <p>¿Estás seguro de que deseas suspender esta suscripción?</p>
        <p className="mt-2 text-sm text-on-surface-variant">
          Se cancelarán todas las reservaciones futuras pendientes y se restaurarán los créditos correspondientes. El usuario no podrá inscribirse a clases hasta que se reactive.
        </p>
      </Modal>

      {/* Refund Confirmation Modal */}
      <Modal
        isOpen={confirmRefundUserId !== null}
        onClose={() => { setConfirmRefundUserId(null); setConfirmRefundName(''); }}
        onConfirm={handleRefundConfirm}
        title="Otorgar crédito de sesión"
        confirmLabel="Sí, otorgar crédito"
        cancelLabel="Cancelar"
        variant="default"
      >
        <p>¿Estás seguro de que deseas otorgar un crédito de sesión a <strong>{confirmRefundName}</strong>?</p>
        <p className="mt-2 text-sm text-on-surface-variant">
          Se incrementará en 1 el número de sesiones disponibles en la suscripción activa del usuario.
        </p>
      </Modal>
    </div>
  );
}
