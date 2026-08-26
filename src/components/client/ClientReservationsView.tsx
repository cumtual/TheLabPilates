'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { formatFriendlyDate, formatRelativeDate } from '@/lib/utils/date';
import { ReservationCard } from './ReservationCard';
import { Pagination } from '@/components/ui/Pagination';

const PAGE_SIZE = 10;

export interface GuestInfo {
  guestEnrollmentId: string;
  guestName: string;
}

export interface ReservationHistoryItem {
  id: string;
  classId: string;
  classDate: string;
  classType: string | null;
  coachName: string | null;
  enrollmentStatus: string | null;
  /** Associated active guest enrollment, if any */
  guest: GuestInfo | null;
  /** Whether the class has available capacity */
  hasCapacity: boolean;
}

interface ClientReservationsViewProps {
  reservations: ReservationHistoryItem[];
  /** Whether the user is eligible to add guests (Open Lab + credits available) */
  guestEligible: boolean;
}

type StatusFilter = 'all' | 'pending' | 'attended' | 'absent' | 'late_cancelled' | 'cancelled';

const filterLabels: Record<StatusFilter, string> = {
  all: 'Todas',
  pending: 'Reservadas',
  attended: 'Completadas',
  absent: 'Ausencias',
  late_cancelled: 'Cancel. tardía',
  cancelled: 'Canceladas',
};

const classTypeLabels: Record<string, string> = {
  yoga: 'Yoga',
  mat_pilates: 'Mat Pilates',
  barre: 'Barre',
};

const statusLabels: Record<string, string> = {
  pending: 'Reservada',
  attended: 'Asistió',
  absent: 'Ausente',
  late_cancelled: 'Cancel. tardía',
  cancelled: 'Cancelada',
};

const statusVariants: Record<string, BadgeVariant> = {
  pending: 'pending',
  attended: 'confirmed',
  absent: 'absent',
  late_cancelled: 'cancelled',
  cancelled: 'cancelled',
};

export function ClientReservationsView({ reservations, guestEligible }: ClientReservationsViewProps) {
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [page, setPage] = useState(1);

  // Filter from full dataset
  const filteredReservations = filter === 'all'
    ? reservations
    : reservations.filter((r) => r.enrollmentStatus === filter);

  // Paginate the filtered results
  const totalPages = Math.ceil(filteredReservations.length / PAGE_SIZE);
  const paginatedReservations = filteredReservations.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE
  );

  // Counts from ALL data
  const counts: Record<StatusFilter, number> = {
    all: reservations.length,
    pending: reservations.filter((r) => r.enrollmentStatus === 'pending').length,
    attended: reservations.filter((r) => r.enrollmentStatus === 'attended').length,
    absent: reservations.filter((r) => r.enrollmentStatus === 'absent').length,
    late_cancelled: reservations.filter((r) => r.enrollmentStatus === 'late_cancelled').length,
    cancelled: reservations.filter((r) => r.enrollmentStatus === 'cancelled').length,
  };

  // Only show filters that have at least 1 item (except "all" which always shows)
  const visibleFilters = (Object.keys(filterLabels) as StatusFilter[]).filter(
    (key) => key === 'all' || counts[key] > 0
  );

  if (reservations.length === 0) {
    return (
      <div className="bg-surface border border-outline-variant/40 rounded-lg p-6 text-center">
        <p className="font-body text-sm text-outline">
          No tienes historial de reservaciones.
        </p>
        <a
          href="/client/classes"
          className="inline-flex items-center justify-center mt-4 px-4 py-2 min-h-11 font-body text-sm font-semibold uppercase tracking-wider bg-soft-charcoal text-on-primary rounded-DEFAULT transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-soft-charcoal"
        >
          Ver clases disponibles
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        {visibleFilters.map((key) => (
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

      {/* Lista */}
      {filteredReservations.length === 0 ? (
        <Card>
          <p className="font-body text-sm text-outline text-center py-4">
            No hay reservaciones con este filtro.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {paginatedReservations.map((reservation) => {
            const isFuturePending =
              reservation.enrollmentStatus === 'pending' &&
              new Date(reservation.classDate) > new Date();

            if (isFuturePending) {
              return (
                <ReservationCard
                  key={reservation.id}
                  reservation={{
                    id: reservation.id,
                    classDate: reservation.classDate,
                    classType: reservation.classType,
                    coachName: reservation.coachName,
                  }}
                  guest={reservation.guest}
                  hasCapacity={reservation.hasCapacity}
                  isEligible={guestEligible}
                />
              );
            }

            const relative = formatRelativeDate(reservation.classDate);
            return (
              <Card key={reservation.id}>
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <h3 className="font-body text-base font-semibold text-on-surface">
                      {reservation.classType
                        ? classTypeLabels[reservation.classType] ?? reservation.classType
                        : 'Clase'}
                    </h3>
                    <p className="font-body text-sm text-outline capitalize">
                      {formatFriendlyDate(reservation.classDate)}
                    </p>
                    {relative && (
                      <p className="font-body text-xs text-primary font-medium">{relative}</p>
                    )}
                    {reservation.coachName && (
                      <p className="font-body text-sm text-on-surface-variant">
                        Coach: {reservation.coachName}
                      </p>
                    )}
                  </div>
                  <Badge variant={statusVariants[reservation.enrollmentStatus ?? ''] ?? 'pending'}>
                    {statusLabels[reservation.enrollmentStatus ?? ''] ?? reservation.enrollmentStatus}
                  </Badge>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Paginación */}
      <Pagination currentPage={page} totalPages={totalPages} onChange={setPage} />
    </div>
  );
}
