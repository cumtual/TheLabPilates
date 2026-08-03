'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Pagination } from '@/components/ui/Pagination';
import type { BadgeVariant } from '@/components/ui/Badge';

const PAGE_SIZE = 5;

interface AttendanceMetrics {
  totalAttended: number;
  totalAbsences: number;
  totalLateCancellations: number;
}

interface SubscriptionRecord {
  id: string;
  name: string | null;
  active: boolean;
  daysRemaining: number | null;
  expirationDate: string | null;
  createdAt: string;
}

interface PaymentRecord {
  id: string;
  paymentType: 'cash' | 'transfer' | 'card';
  confirmed: boolean;
  amount: number | null;
  createdAt: string;
}

interface AttendanceRecord {
  id: string;
  classType: string | null;
  classDate: string;
  status: string | null;
}

interface ClientHistoryProps {
  clientName: string;
  clientEmail: string;
  metrics: AttendanceMetrics;
  subscriptions: SubscriptionRecord[];
  payments: PaymentRecord[];
  attendance: AttendanceRecord[];
  error?: string | null;
}

const paymentTypeLabels: Record<string, string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  card: 'Tarjeta',
};

const classTypeLabels: Record<string, string> = {
  yoga: 'Yoga',
  mat_pilates: 'Mat Pilates',
  barre: 'Barre',
};

const enrollmentStatusLabels: Record<string, string> = {
  pending: 'Pendiente',
  attended: 'Asistió',
  absent: 'Ausente',
  late_cancelled: 'Cancel. tardía',
  cancelled: 'Cancelada',
};

const enrollmentStatusVariant: Record<string, BadgeVariant> = {
  pending: 'pending',
  attended: 'confirmed',
  absent: 'absent',
  late_cancelled: 'cancelled',
  cancelled: 'cancelled',
};

export function ClientHistory({
  clientName,
  clientEmail,
  metrics,
  subscriptions,
  payments,
  attendance,
  error,
}: ClientHistoryProps) {
  const [retrying, setRetrying] = useState(false);
  const [subsPage, setSubsPage] = useState(1);
  const [paymentsPage, setPaymentsPage] = useState(1);
  const [attendancePage, setAttendancePage] = useState(1);

  if (error) {
    return (
      <Card>
        <div className="text-center py-8 space-y-4">
          <p className="font-body text-sm text-error">{error}</p>
          <button
            type="button"
            onClick={() => {
              setRetrying(true);
              window.location.reload();
            }}
            disabled={retrying}
            className="inline-flex items-center justify-center px-5 py-3 font-body text-sm font-semibold uppercase tracking-wider bg-primary text-on-primary rounded-lg transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50 disabled:cursor-not-allowed min-h-11 min-w-11"
          >
            {retrying ? 'Reintentando...' : 'Reintentar'}
          </button>
        </div>
      </Card>
    );
  }

  const isEmpty =
    subscriptions.length === 0 &&
    payments.length === 0 &&
    attendance.length === 0;

  if (isEmpty) {
    return (
      <Card>
        <p className="font-body text-sm text-outline text-center py-8">
          No hay historial disponible para este cliente.
        </p>
      </Card>
    );
  }

  // Paginate each section
  const subsTotalPages = Math.ceil(subscriptions.length / PAGE_SIZE);
  const paginatedSubs = subscriptions.slice((subsPage - 1) * PAGE_SIZE, subsPage * PAGE_SIZE);

  const paymentsTotalPages = Math.ceil(payments.length / PAGE_SIZE);
  const paginatedPayments = payments.slice((paymentsPage - 1) * PAGE_SIZE, paymentsPage * PAGE_SIZE);

  const attendanceTotalPages = Math.ceil(attendance.length / PAGE_SIZE);
  const paginatedAttendance = attendance.slice((attendancePage - 1) * PAGE_SIZE, attendancePage * PAGE_SIZE);

  return (
    <div className="space-y-6">
      {/* Client info header */}
      <Card>
        <div className="space-y-1">
          <p className="font-body text-base font-semibold text-on-surface">
            {clientName}
          </p>
          <p className="font-body text-sm text-outline">{clientEmail}</p>
        </div>
      </Card>

      {/* Metrics section */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="text-center">
          <p className="font-body text-2xl font-bold text-primary">
            {metrics.totalAttended}
          </p>
          <p className="font-body text-xs text-outline mt-1">Asistencias</p>
        </Card>
        <Card className="text-center">
          <p className="font-body text-2xl font-bold text-error">
            {metrics.totalAbsences}
          </p>
          <p className="font-body text-xs text-outline mt-1">Ausencias</p>
        </Card>
        <Card className="text-center">
          <p className="font-body text-2xl font-bold text-secondary">
            {metrics.totalLateCancellations}
          </p>
          <p className="font-body text-xs text-outline mt-1">Cancel. tardías</p>
        </Card>
      </div>

      {/* Subscriptions section */}
      {subscriptions.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-body text-base font-semibold text-on-surface">
            Suscripciones ({subscriptions.length})
          </h2>
          <div className="space-y-3">
            {paginatedSubs.map((sub) => (
              <Card key={sub.id}>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1 flex-1">
                    <p className="font-body text-sm font-semibold text-on-surface">
                      {sub.name ?? 'Suscripción'}
                    </p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant={sub.active ? 'active' : 'expired'}>
                        {sub.active ? 'Activa' : 'Inactiva'}
                      </Badge>
                      {sub.daysRemaining != null && (
                        <span className="font-body text-xs text-on-surface-variant">
                          Clases restantes: {sub.daysRemaining}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right space-y-1">
                    {sub.expirationDate && (
                      <p className="font-body text-xs text-outline">
                        Vence: {sub.expirationDate}
                      </p>
                    )}
                    <p className="font-body text-xs text-outline">
                      Creada: {sub.createdAt}
                    </p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
          <Pagination currentPage={subsPage} totalPages={subsTotalPages} onChange={setSubsPage} />
        </div>
      )}

      {/* Payments section */}
      {payments.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-body text-base font-semibold text-on-surface">
            Pagos ({payments.length})
          </h2>
          <div className="space-y-3">
            {paginatedPayments.map((payment) => (
              <Card key={payment.id}>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="pending">
                        {paymentTypeLabels[payment.paymentType] ?? payment.paymentType}
                      </Badge>
                      <Badge variant={payment.confirmed ? 'confirmed' : 'pending'}>
                        {payment.confirmed ? 'Confirmado' : 'Pendiente'}
                      </Badge>
                    </div>
                    {payment.amount != null && (
                      <p className="font-body text-sm font-medium text-on-surface">
                        ${payment.amount}
                      </p>
                    )}
                  </div>
                  <p className="font-body text-xs text-outline">
                    {payment.createdAt}
                  </p>
                </div>
              </Card>
            ))}
          </div>
          <Pagination currentPage={paymentsPage} totalPages={paymentsTotalPages} onChange={setPaymentsPage} />
        </div>
      )}

      {/* Attendance section */}
      {attendance.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-body text-base font-semibold text-on-surface">
            Asistencia ({attendance.length})
          </h2>
          <div className="space-y-3">
            {paginatedAttendance.map((record) => (
              <Card key={record.id}>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1 flex-1">
                    <p className="font-body text-sm font-semibold text-on-surface">
                      {classTypeLabels[record.classType ?? ''] ?? record.classType ?? 'Clase'}
                    </p>
                    {record.status && (
                      <Badge variant={enrollmentStatusVariant[record.status] ?? 'pending'}>
                        {enrollmentStatusLabels[record.status] ?? record.status}
                      </Badge>
                    )}
                  </div>
                  <p className="font-body text-xs text-outline">
                    {record.classDate}
                  </p>
                </div>
              </Card>
            ))}
          </div>
          <Pagination currentPage={attendancePage} totalPages={attendanceTotalPages} onChange={setAttendancePage} />
        </div>
      )}
    </div>
  );
}
