'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { Pagination } from '@/components/ui/Pagination';
import { formatFullDateTime, formatShortDateTime } from '@/lib/utils/date';
import { getClassDisplayName } from '@/lib/utils/class-type';
import type {
  SpecialEventHistoryItem,
  SpecialEventHistoryStatus,
  SpecialEventRegistrationHistory,
} from '@/lib/queries/events';

const CLIENT_PAGE_SIZE = 10;

interface SpecialEventHistoryProps {
  events: SpecialEventHistoryItem[];
}

type StatusFilter = 'all' | SpecialEventHistoryStatus;

const filterLabels: Record<StatusFilter, string> = {
  all: 'Todos',
  active: 'Activos',
  completed: 'Completados',
  cancelled: 'Cancelados',
};

const statusLabels: Record<SpecialEventHistoryStatus, string> = {
  active: 'Activo',
  completed: 'Completado',
  cancelled: 'Cancelado',
};

const statusVariants: Record<SpecialEventHistoryStatus, BadgeVariant> = {
  active: 'active',
  completed: 'confirmed',
  cancelled: 'cancelled',
};

const paymentTypeLabels: Record<SpecialEventRegistrationHistory['paymentType'], string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  card: 'Tarjeta',
};

const registrationStatusLabels: Record<SpecialEventRegistrationHistory['status'], string> = {
  pending: 'Pago pendiente',
  confirmed: 'Confirmado',
  refund_pending: 'Reembolso pendiente',
  refunded: 'Reembolsado',
};

const registrationStatusVariants: Record<SpecialEventRegistrationHistory['status'], BadgeVariant> = {
  pending: 'pending',
  confirmed: 'confirmed',
  refund_pending: 'cancelled',
  refunded: 'expired',
};

export function SpecialEventHistory({ events }: SpecialEventHistoryProps) {
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [clientPage, setClientPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filteredEvents =
    filter === 'all' ? events : events.filter((event) => event.status === filter);

  const totalClientPages = Math.ceil(filteredEvents.length / CLIENT_PAGE_SIZE);
  const paginatedEvents = filteredEvents.slice(
    (clientPage - 1) * CLIENT_PAGE_SIZE,
    clientPage * CLIENT_PAGE_SIZE
  );

  const counts: Record<StatusFilter, number> = {
    all: events.length,
    active: events.filter((e) => e.status === 'active').length,
    completed: events.filter((e) => e.status === 'completed').length,
    cancelled: events.filter((e) => e.status === 'cancelled').length,
  };

  function toggleExpand(eventId: string) {
    setExpandedId(expandedId === eventId ? null : eventId);
  }

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        {(Object.keys(filterLabels) as StatusFilter[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setFilter(key);
              setClientPage(1);
            }}
            className={`inline-flex items-center gap-1.5 px-3 py-2 min-h-11 rounded-lg font-body text-sm font-medium transition-colors ${
              filter === key
                ? 'bg-primary text-on-primary'
                : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high'
            }`}
          >
            {filterLabels[key]}
            <span
              className={`text-xs px-1.5 py-0.5 rounded-full ${
                filter === key
                  ? 'bg-on-primary/20 text-on-primary'
                  : 'bg-outline-variant/30 text-outline'
              }`}
            >
              {counts[key]}
            </span>
          </button>
        ))}
      </div>

      {filteredEvents.length === 0 ? (
        <p className="text-center text-on-surface-variant py-8 font-body">
          {filter === 'all'
            ? 'Aún no hay eventos registrados.'
            : `No hay eventos ${filterLabels[filter].toLowerCase()}.`}
        </p>
      ) : (
        <div className="space-y-3">
          {paginatedEvents.map((event) => {
            const isExpanded = expandedId === event.id;
            const attendeeCount = event.classes.reduce(
              (sum, cls) => sum + cls.registrations.length,
              0
            );

            return (
              <div
                key={event.id}
                className="bg-surface rounded-lg border border-outline-variant/40 overflow-hidden"
              >
                {/* Header */}
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-body font-semibold text-on-surface">{event.title}</h3>
                        <Badge variant={statusVariants[event.status]}>
                          {statusLabels[event.status]}
                        </Badge>
                        {event.status === 'active' && event.showOnLanding && (
                          <Badge variant="confirmed">En landing</Badge>
                        )}
                      </div>
                      <p className="font-body text-sm text-on-surface-variant mt-1 capitalize">
                        {event.startDate ? formatFullDateTime(new Date(event.startDate)) : 'Sin fecha'}
                        {event.endDate
                          ? ` — ${formatFullDateTime(new Date(event.endDate))}`
                          : ''}
                      </p>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
                        <p className="font-body text-sm text-on-surface-variant">
                          Clases: {event.classCount}
                        </p>
                        <p className="font-body text-sm text-on-surface-variant">
                          Inscritos: {event.confirmedCount}
                        </p>
                        <p className="font-body text-sm text-on-surface-variant">
                          Recaudación:{' '}
                          <span className="font-semibold text-on-surface">
                            ${event.revenue} MXN
                          </span>
                        </p>
                      </div>
                    </div>

                    <Link
                      href={`/admin/events/${event.id}`}
                      className="inline-flex items-center gap-1 min-h-11 px-3 py-2 font-body text-sm font-medium text-secondary hover:underline whitespace-nowrap"
                    >
                      <span className="material-symbols-outlined text-[18px]">open_in_new</span>
                      Ver detalle
                    </Link>
                  </div>

                  {/* Toggle asistentes */}
                  {attendeeCount > 0 && (
                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={() => toggleExpand(event.id)}
                        className="inline-flex items-center gap-1 font-body text-sm text-primary font-medium hover:underline min-h-11"
                      >
                        <span
                          className="material-symbols-outlined text-[18px] transition-transform"
                          style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
                        >
                          expand_more
                        </span>
                        {isExpanded ? 'Ocultar asistentes' : `Ver asistentes (${attendeeCount})`}
                      </button>
                    </div>
                  )}
                </div>

                {/* Detalle expandible */}
                {isExpanded && (
                  <div className="border-t border-outline-variant/40 bg-surface-container-low px-4 py-4 space-y-4">
                    {event.classes.length === 0 ? (
                      <p className="font-body text-sm text-outline text-center py-2">
                        Este evento no tiene clases registradas.
                      </p>
                    ) : (
                      event.classes.map((cls) => {
                        const occupied = cls.registrations.filter(
                          (r) => r.status === 'confirmed'
                        ).length + cls.guests.length;

                        return (
                          <div
                            key={cls.id}
                            className="rounded-lg border border-outline-variant/40 bg-surface p-4 space-y-3"
                          >
                            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <p className="font-body text-sm font-semibold text-on-surface">
                                  {getClassDisplayName(cls.classType, cls.customName)}
                                </p>
                                <p className="font-body text-xs text-on-surface-variant capitalize">
                                  {cls.classDate
                                    ? formatFullDateTime(new Date(cls.classDate))
                                    : 'Sin fecha'}
                                  {cls.coachName ? ` · Coach: ${cls.coachName}` : ''}
                                </p>
                              </div>
                              <p className="font-body text-xs font-semibold text-on-surface-variant">
                                {occupied}/{cls.capacity} lugares
                              </p>
                            </div>

                            {cls.registrations.length === 0 ? (
                              <p className="font-body text-xs text-outline">
                                Sin inscritos registrados.
                              </p>
                            ) : (
                              <div className="space-y-2">
                                {cls.registrations.map((reg) => (
                                  <div
                                    key={reg.id}
                                    className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between py-2 border-b border-outline-variant/20 last:border-b-0"
                                  >
                                    <div className="min-w-0">
                                      <p className="font-body text-sm font-medium text-on-surface truncate">
                                        {reg.userName}
                                      </p>
                                      <p className="font-body text-xs text-outline truncate">
                                        {reg.userEmail}
                                      </p>
                                      <p className="font-body text-xs text-outline">
                                        {reg.createdAt
                                          ? formatShortDateTime(new Date(reg.createdAt))
                                          : 'Sin fecha'}{' '}
                                        · {paymentTypeLabels[reg.paymentType]} · ${reg.amountPaid} MXN
                                      </p>
                                    </div>
                                    <Badge variant={registrationStatusVariants[reg.status]}>
                                      {registrationStatusLabels[reg.status]}
                                    </Badge>
                                  </div>
                                ))}
                              </div>
                            )}

                            {cls.guests.length > 0 && (
                              <div className="space-y-2 pt-2 border-t border-outline-variant/20">
                                {cls.guests.map((guest) => (
                                  <div
                                    key={guest.id}
                                    className="pl-3 border-l-2 border-l-primary/40 flex items-center justify-between gap-2"
                                  >
                                    <div className="min-w-0">
                                      <p className="font-body text-sm text-on-surface truncate">
                                        {guest.guestName}{' '}
                                        <span className="text-outline">
                                          ({guest.origin === 'admin' ? 'Invitado admin' : 'Invitado'})
                                        </span>
                                      </p>
                                      {guest.registeredByName && (
                                        <p className="font-body text-xs text-outline truncate">
                                          Registrado por: {guest.registeredByName}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Pagination
        currentPage={clientPage}
        totalPages={totalClientPages}
        onChange={setClientPage}
      />
    </div>
  );
}
