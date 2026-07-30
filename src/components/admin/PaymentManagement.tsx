'use client';

import { useState, useTransition } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Pagination } from '@/components/ui/Pagination';
import { confirmPaymentAction } from '@/actions/admin';

const PAGE_SIZE = 10;

interface Payment {
  paymentId: string;
  clientName: string;
  clientEmail: string;
  paymentType: 'cash' | 'transfer' | 'card';
  confirmed: boolean;
  amount: number | null;
  createdAt: string;
  createdAtRaw: string | null;
  dateConfirmed: string | null;
  subscriptionName: string | null;
}

interface PaymentManagementProps {
  payments: Payment[];
}

type TypeFilter = 'all' | 'cash' | 'transfer' | 'card';
type StatusFilter = 'all' | 'pending' | 'confirmed';

const typeLabels: Record<TypeFilter, string> = {
  all: 'Todos',
  cash: 'Efectivo',
  transfer: 'Transferencia',
  card: 'Tarjeta',
};

const statusFilterLabels: Record<StatusFilter, string> = {
  all: 'Todos',
  pending: 'Pendientes',
  confirmed: 'Confirmados',
};

export function PaymentManagement({ payments }: PaymentManagementProps) {
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [confirmedIds, setConfirmedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);

  // Apply filters
  const filteredPayments = payments.filter((p) => {
    if (typeFilter !== 'all' && p.paymentType !== typeFilter) return false;
    if (statusFilter === 'pending' && (p.confirmed || confirmedIds.has(p.paymentId))) return false;
    if (statusFilter === 'confirmed' && !p.confirmed && !confirmedIds.has(p.paymentId)) return false;

    // Date filter
    if (dateFrom && p.createdAtRaw) {
      const paymentDate = new Date(p.createdAtRaw);
      const fromDate = new Date(dateFrom);
      fromDate.setHours(0, 0, 0, 0);
      if (paymentDate < fromDate) return false;
    }
    if (dateTo && p.createdAtRaw) {
      const paymentDate = new Date(p.createdAtRaw);
      const toDate = new Date(dateTo);
      toDate.setHours(23, 59, 59, 999);
      if (paymentDate > toDate) return false;
    }

    return true;
  });

  // Paginate
  const totalPages = Math.ceil(filteredPayments.length / PAGE_SIZE);
  const paginatedPayments = filteredPayments.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE
  );

  // First apply date filter to get the base dataset
  const dateFilteredPayments = payments.filter((p) => {
    if (dateFrom && p.createdAtRaw) {
      const paymentDate = new Date(p.createdAtRaw);
      const fromDate = new Date(dateFrom);
      fromDate.setHours(0, 0, 0, 0);
      if (paymentDate < fromDate) return false;
    }
    if (dateTo && p.createdAtRaw) {
      const paymentDate = new Date(p.createdAtRaw);
      const toDate = new Date(dateTo);
      toDate.setHours(23, 59, 59, 999);
      if (paymentDate > toDate) return false;
    }
    return true;
  });

  // Counts for type filter (based on date-filtered data)
  const typeCounts: Record<TypeFilter, number> = {
    all: dateFilteredPayments.length,
    cash: dateFilteredPayments.filter((p) => p.paymentType === 'cash').length,
    transfer: dateFilteredPayments.filter((p) => p.paymentType === 'transfer').length,
    card: dateFilteredPayments.filter((p) => p.paymentType === 'card').length,
  };

  // Counts for status filter (within date + type filter)
  const dateAndTypeFiltered = typeFilter === 'all'
    ? dateFilteredPayments
    : dateFilteredPayments.filter((p) => p.paymentType === typeFilter);
  const statusCounts: Record<StatusFilter, number> = {
    all: dateAndTypeFiltered.length,
    pending: dateAndTypeFiltered.filter((p) => !p.confirmed && !confirmedIds.has(p.paymentId)).length,
    confirmed: dateAndTypeFiltered.filter((p) => p.confirmed || confirmedIds.has(p.paymentId)).length,
  };

  function handleConfirm(paymentId: string) {
    setError(null);
    setSuccessMessage(null);
    setPendingId(paymentId);

    startTransition(async () => {
      const result = await confirmPaymentAction(paymentId);
      if (result.success) {
        setConfirmedIds((prev) => new Set([...prev, paymentId]));
        setSuccessMessage(result.message ?? 'Pago confirmado exitosamente.');
      } else {
        setError(result.error);
      }
      setPendingId(null);
    });
  }

  return (
    <div className="space-y-4">
      {/* Filtros por tipo de pago */}
      <div>
        <p className="font-body text-xs text-outline uppercase tracking-wider mb-2">Tipo de pago</p>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(typeLabels) as TypeFilter[]).filter((k) => k === 'all' || typeCounts[k] > 0).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => { setTypeFilter(key); setPage(1); }}
              className={`inline-flex items-center gap-1.5 px-3 py-2 min-h-11 rounded-lg font-body text-sm font-medium transition-colors ${
                typeFilter === key
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high'
              }`}
            >
              {typeLabels[key]}
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                typeFilter === key
                  ? 'bg-on-primary/20 text-on-primary'
                  : 'bg-outline-variant/30 text-outline'
              }`}>
                {typeCounts[key]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Filtros por estado */}
      <div>
        <p className="font-body text-xs text-outline uppercase tracking-wider mb-2">Estado</p>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(statusFilterLabels) as StatusFilter[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => { setStatusFilter(key); setPage(1); }}
              className={`inline-flex items-center gap-1.5 px-3 py-2 min-h-11 rounded-lg font-body text-sm font-medium transition-colors ${
                statusFilter === key
                  ? 'bg-soft-charcoal text-on-primary'
                  : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high'
              }`}
            >
              {statusFilterLabels[key]}
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                statusFilter === key
                  ? 'bg-on-primary/20 text-on-primary'
                  : 'bg-outline-variant/30 text-outline'
              }`}>
                {statusCounts[key]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Filtro por fecha */}
      <div>
        <p className="font-body text-xs text-outline uppercase tracking-wider mb-2">Fecha de registro</p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
            className="min-h-11 px-3 py-2 font-body text-sm text-on-surface bg-surface border border-outline-variant rounded-lg focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          />
          <span className="font-body text-sm text-outline">a</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
            className="min-h-11 px-3 py-2 font-body text-sm text-on-surface bg-surface border border-outline-variant rounded-lg focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          />
          {(dateFrom || dateTo) && (
            <button
              type="button"
              onClick={() => { setDateFrom(''); setDateTo(''); setPage(1); }}
              className="min-h-11 px-3 py-2 font-body text-sm text-on-surface-variant bg-surface-container-low border border-outline-variant rounded-lg hover:bg-surface-container-high transition-colors"
            >
              Limpiar
            </button>
          )}
        </div>
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

      {/* Results count */}
      <p className="font-body text-sm text-outline">
        {filteredPayments.length} pago{filteredPayments.length !== 1 ? 's' : ''}
      </p>

      {/* Payment List */}
      {filteredPayments.length === 0 ? (
        <Card>
          <p className="font-body text-sm text-outline text-center py-8">
            No hay pagos con los filtros seleccionados.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {paginatedPayments.map((payment) => {
            const isConfirmed = payment.confirmed || confirmedIds.has(payment.paymentId);

            return (
              <Card key={payment.paymentId}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1 flex-1">
                    <p className="font-body text-sm font-semibold text-on-surface">
                      {payment.clientName}
                    </p>
                    <p className="font-body text-xs text-outline">
                      {payment.clientEmail}
                    </p>
                    {payment.subscriptionName && (
                      <p className="font-body text-xs text-on-surface-variant">
                        {payment.subscriptionName}
                      </p>
                    )}
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="pending">
                        {typeLabels[payment.paymentType] ?? payment.paymentType}
                      </Badge>
                      <Badge variant={isConfirmed ? 'confirmed' : 'pending'}>
                        {isConfirmed ? 'Confirmado' : 'Pendiente'}
                      </Badge>
                      {payment.amount != null && (
                        <span className="font-body text-sm font-medium text-on-surface">
                          ${payment.amount} MXN
                        </span>
                      )}
                    </div>
                    <p className="font-body text-xs text-outline">
                      Registrado: {payment.createdAt}
                      {payment.dateConfirmed && ` · Confirmado: ${payment.dateConfirmed}`}
                    </p>
                  </div>

                  {!isConfirmed && (
                    <button
                      type="button"
                      onClick={() => handleConfirm(payment.paymentId)}
                      disabled={isPending && pendingId === payment.paymentId}
                      className="inline-flex items-center justify-center px-5 py-3 font-body text-sm font-semibold uppercase tracking-wider bg-primary text-on-primary rounded-lg transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none min-h-11 min-w-11"
                    >
                      {isPending && pendingId === payment.paymentId
                        ? 'Confirmando...'
                        : 'Confirmar'}
                    </button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      <Pagination currentPage={page} totalPages={totalPages} onChange={setPage} />
    </div>
  );
}
