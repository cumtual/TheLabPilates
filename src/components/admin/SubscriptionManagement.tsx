'use client';

import { useState, useEffect, useRef, useTransition, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { Pagination } from '@/components/ui/Pagination';
import {
  suspendSubscriptionAction,
  reactivateSubscriptionAction,
  refundSessionCreditAction,
  getSubscriptionEnrollmentsAction,
} from '@/actions/admin';

interface SubscriptionItem {
  subscriptionId: string;
  userId: string;
  clientName: string;
  clientEmail: string;
  subscriptionName: string | null;
  daysRemaining: number | null;
  expirationDate: string | null;
  active: boolean;
  status: 'pending' | 'active' | 'suspended' | 'expired' | null;
}

type StatusFilter = 'all' | 'active' | 'suspended' | 'expired';

interface SubscriptionManagementProps {
  subscriptions: SubscriptionItem[];
  totalPages: number;
  currentPage: number;
  currentFilter: StatusFilter;
  currentSearch: string;
  statusCounts: {
    all: number;
    active: number;
    suspended: number;
    expired: number;
  };
}

const filterLabels: Record<StatusFilter, string> = {
  all: 'Todas',
  active: 'Activas',
  suspended: 'Suspendidas',
  expired: 'Vencidas',
};

export function SubscriptionManagement({
  subscriptions,
  totalPages,
  currentPage,
  currentFilter,
  currentSearch,
  statusCounts,
}: SubscriptionManagementProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  // Confirmation modals
  const [confirmSuspendId, setConfirmSuspendId] = useState<string | null>(null);
  const [confirmRefundUserId, setConfirmRefundUserId] = useState<string | null>(null);
  const [confirmRefundName, setConfirmRefundName] = useState<string>('');

  // Enrollments detail view
  const [expandedSubscription, setExpandedSubscription] = useState<string | null>(null);
  const [enrollmentsData, setEnrollmentsData] = useState<Record<string, Array<{ enrollmentId: string; classDate: string; classType: string; classStatus: string; enrollmentStatus: string; coachName: string }>>>({});
  const [loadingEnrollments, setLoadingEnrollments] = useState<string | null>(null);

  // Track local status changes for optimistic UI
  const [localStatusState, setLocalStatusState] = useState<Record<string, 'active' | 'suspended' | 'expired'>>({});

  // Search state with debounce
  const [searchInput, setSearchInput] = useState(currentSearch);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync searchInput when currentSearch prop changes (e.g., browser back/forward)
  useEffect(() => {
    setSearchInput(currentSearch);
  }, [currentSearch]);

  // Debounce search input → push to URL
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Skip if input matches the current URL search
    if (searchInput === currentSearch) return;

    debounceTimerRef.current = setTimeout(() => {
      navigateWithParams({
        search: searchInput || undefined,
        page: undefined, // Reset to page 1 on search change
      });
    }, 300);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  function getEffectiveStatus(sub: SubscriptionItem): 'pending' | 'active' | 'suspended' | 'expired' {
    const localOverride = localStatusState[sub.subscriptionId];
    if (localOverride) return localOverride;
    return sub.status ?? (sub.active ? 'active' : 'suspended');
  }

  const navigateWithParams = useCallback(
    (updates: Record<string, string | undefined>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === undefined || value === '') {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      }
      const query = params.toString();
      router.push(query ? `?${query}` : '?');
    },
    [router, searchParams]
  );

  function handleFilterChange(newFilter: StatusFilter) {
    navigateWithParams({
      statusFilter: newFilter === 'all' ? undefined : newFilter,
      page: undefined, // Reset to page 1 on filter change
    });
  }

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
        setLocalStatusState((prev) => ({ ...prev, [id]: 'suspended' }));
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
        setLocalStatusState((prev) => ({ ...prev, [subscriptionId]: 'active' }));
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

  async function handleToggleEnrollments(subscriptionId: string) {
    if (expandedSubscription === subscriptionId) {
      setExpandedSubscription(null);
      return;
    }

    setExpandedSubscription(subscriptionId);

    // Only fetch if not already cached
    if (!enrollmentsData[subscriptionId]) {
      setLoadingEnrollments(subscriptionId);
      const result = await getSubscriptionEnrollmentsAction(subscriptionId);
      if (result.success && result.enrollments) {
        setEnrollmentsData((prev) => ({ ...prev, [subscriptionId]: result.enrollments! }));
      }
      setLoadingEnrollments(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="relative">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-outline"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
          />
        </svg>
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Buscar por nombre o correo..."
          className="w-full min-h-11 pl-10 pr-10 py-2 rounded-lg border border-outline-variant bg-surface-container-low text-on-surface font-body text-sm placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-colors"
        />
        {searchInput && (
          <button
            type="button"
            onClick={() => setSearchInput('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 flex items-center justify-center rounded-full text-outline hover:text-on-surface hover:bg-surface-container-high transition-colors"
            aria-label="Limpiar búsqueda"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="h-3.5 w-3.5"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {(Object.keys(filterLabels) as StatusFilter[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => handleFilterChange(key)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 min-h-11 rounded-lg font-body text-sm font-medium transition-colors ${
              currentFilter === key
                ? 'bg-primary text-on-primary'
                : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high'
            }`}
          >
            {filterLabels[key]}
            <span className={`text-xs px-1.5 py-0.5 rounded-full ${
              currentFilter === key
                ? 'bg-on-primary/20 text-on-primary'
                : 'bg-outline-variant/30 text-outline'
            }`}>
              {statusCounts[key]}
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
      {subscriptions.length === 0 ? (
        <Card>
          <p className="font-body text-sm text-outline text-center py-8">
            {currentFilter === 'all'
              ? 'No hay suscripciones registradas.'
              : `No hay suscripciones ${filterLabels[currentFilter].toLowerCase()}.`}
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {subscriptions.map((sub) => {
            const effectiveStatus = getEffectiveStatus(sub);

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
                      {effectiveStatus === 'active' && (
                        <Badge variant="confirmed">Activa</Badge>
                      )}
                      {effectiveStatus === 'suspended' && (
                        <Badge variant="cancelled">Suspendida</Badge>
                      )}
                      {effectiveStatus === 'expired' && (
                        <Badge variant="expired">Vencida</Badge>
                      )}
                      {effectiveStatus === 'pending' && (
                        <Badge variant="pending">Pendiente</Badge>
                      )}
                      <span className="font-body text-sm text-on-surface">
                        Créditos: {sub.daysRemaining ?? 0}
                      </span>
                      {sub.expirationDate && (
                        <span className="font-body text-xs text-outline">
                          {effectiveStatus === 'expired' ? 'Vencida' : 'Vence'}: {sub.expirationDate}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row">
                    {effectiveStatus === 'active' ? (
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
                    ) : effectiveStatus === 'suspended' ? (
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
                    ) : null}
                  </div>

                  {/* Ver clases button */}
                  <button
                    type="button"
                    onClick={() => handleToggleEnrollments(sub.subscriptionId)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 font-body text-xs font-medium text-primary hover:text-primary/80 transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-4 w-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                    </svg>
                    {expandedSubscription === sub.subscriptionId ? 'Ocultar clases' : 'Ver clases inscritas'}
                  </button>

                  {/* Enrollments detail */}
                  {expandedSubscription === sub.subscriptionId && (
                    <div className="border-t border-outline-variant/30 pt-3 mt-1">
                      {loadingEnrollments === sub.subscriptionId ? (
                        <p className="font-body text-xs text-outline animate-pulse">Cargando clases...</p>
                      ) : enrollmentsData[sub.subscriptionId]?.length === 0 ? (
                        <p className="font-body text-xs text-outline">No hay inscripciones registradas.</p>
                      ) : (
                        <div className="space-y-2">
                          <p className="font-body text-xs font-semibold text-on-surface-variant">
                            Clases inscritas ({enrollmentsData[sub.subscriptionId]?.length ?? 0})
                          </p>
                          <div className="grid gap-1.5">
                            {enrollmentsData[sub.subscriptionId]?.map((enrollment) => (
                              <div
                                key={enrollment.enrollmentId}
                                className="flex items-center justify-between gap-2 px-3 py-2 rounded-md bg-surface-container-low"
                              >
                                <div className="flex flex-col gap-0.5">
                                  <span className="font-body text-xs font-medium text-on-surface">
                                    {enrollment.classType} — {enrollment.classDate}
                                  </span>
                                  <span className="font-body text-xs text-outline">
                                    Coach: {enrollment.coachName}
                                  </span>
                                </div>
                                <div className="flex flex-col items-end gap-0.5">
                                  <span className="font-body text-xs text-on-surface-variant">
                                    {enrollment.enrollmentStatus}
                                  </span>
                                  <span className="font-body text-xs text-outline">
                                    Clase: {enrollment.classStatus}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Pagination — uses URL-based navigation since onChange is not provided */}
      <Pagination currentPage={currentPage} totalPages={totalPages} />

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
