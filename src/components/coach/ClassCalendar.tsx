'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { formatFriendlyDate, formatRelativeDate } from '@/lib/utils/date';
import { Pagination } from '@/components/ui/Pagination';
import { getClassDisplayName } from '@/lib/utils/class-type';

const CLIENT_PAGE_SIZE = 10;

interface OpenClass {
  id: string;
  classDate: Date | string | null;
  coachUserId: string | null;
  capacity: number | null;
  available: string | null;
  classType: string | null;
  customName?: string | null;
  status: string | null;
  createdAt: Date | string | null;
}

interface ClassCalendarProps {
  classes: OpenClass[];
}

type StatusFilter = 'all' | 'scheduled' | 'completed' | 'cancelled';

const statusLabels: Record<string, string> = {
  scheduled: 'Programada',
  completed: 'Completada',
  cancelled: 'Cancelada',
};

const statusVariants: Record<string, BadgeVariant> = {
  scheduled: 'active',
  completed: 'confirmed',
  cancelled: 'cancelled',
};

const filterLabels: Record<StatusFilter, string> = {
  all: 'Todas',
  scheduled: 'Programadas',
  completed: 'Completadas',
  cancelled: 'Canceladas',
};

function isClassPast(date: Date | string | null): boolean {
  if (!date) return false;
  return new Date(date) < new Date();
}

export function ClassCalendar({ classes }: ClassCalendarProps) {
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [clientPage, setClientPage] = useState(1);

  const filteredClasses = (filter === 'all'
    ? classes
    : classes.filter((cls) => cls.status === filter)
  ).sort((a, b) => {
    const dateA = a.classDate ? new Date(a.classDate).getTime() : 0;
    const dateB = b.classDate ? new Date(b.classDate).getTime() : 0;
    // Programadas: más próxima primero (ascendente)
    // Completadas/Canceladas: más reciente primero (descendente)
    if (filter === 'scheduled') return dateA - dateB;
    if (filter === 'all') {
      // En "Todas": futuras primero (asc), luego pasadas (desc)
      const now = Date.now();
      const aIsFuture = dateA > now;
      const bIsFuture = dateB > now;
      if (aIsFuture && !bIsFuture) return -1;
      if (!aIsFuture && bIsFuture) return 1;
      if (aIsFuture && bIsFuture) return dateA - dateB;
      return dateB - dateA;
    }
    return dateB - dateA;
  });

  // Counts from ALL data (component has full dataset)
  const counts: Record<StatusFilter, number> = {
    all: classes.length,
    scheduled: classes.filter((c) => c.status === 'scheduled').length,
    completed: classes.filter((c) => c.status === 'completed').length,
    cancelled: classes.filter((c) => c.status === 'cancelled').length,
  };

  const totalClientPages = Math.ceil(filteredClasses.length / CLIENT_PAGE_SIZE);
  const paginatedClasses = filteredClasses.slice(
    (clientPage - 1) * CLIENT_PAGE_SIZE,
    clientPage * CLIENT_PAGE_SIZE
  );

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        {(Object.keys(filterLabels) as StatusFilter[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => { setFilter(key); setClientPage(1); }}
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
      {filteredClasses.length === 0 ? (
        <Card>
          <p className="font-body text-on-surface-variant text-center py-8">
            {filter === 'all'
              ? 'No tienes clases en los últimos 30 días ni próximas.'
              : `No tienes clases ${filterLabels[filter].toLowerCase()}.`}
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {paginatedClasses.map((cls) => {
            const isPast = isClassPast(cls.classDate);
            const statusVariant = statusVariants[cls.status ?? 'scheduled'] ?? 'pending';
            const statusLabel = statusLabels[cls.status ?? 'scheduled'] ?? cls.status;
            const typeLabel = getClassDisplayName(cls.classType, cls.customName);
            const relative = formatRelativeDate(cls.classDate);

            return (
              <Card key={cls.id} className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-body text-sm text-on-surface-variant capitalize">
                      {formatFriendlyDate(cls.classDate)}
                    </p>
                    {relative && (
                      <p className="font-body text-xs text-primary font-medium mt-0.5">
                        {relative}
                      </p>
                    )}
                    <h3 className="font-body text-base font-semibold text-on-surface mt-1">
                      {typeLabel}
                    </h3>
                  </div>
                  <Badge variant={statusVariant}>
                    {statusLabel}
                  </Badge>
                </div>

                <div className="flex items-center justify-between">
                  <span className="font-body text-sm text-on-surface-variant">
                    Capacidad: {cls.capacity ?? '—'}
                  </span>

                  {isPast && cls.status === 'completed' && (
                    <Link
                      href={`/coach/attendance/${cls.id}`}
                      className="font-body text-sm text-primary font-medium hover:underline min-h-11 min-w-11 flex items-center justify-center"
                    >
                      Ver asistencia
                    </Link>
                  )}
                  {isPast && cls.status === 'scheduled' && (
                    <Link
                      href={`/coach/attendance/${cls.id}`}
                      className="font-body text-sm text-primary font-medium hover:underline min-h-11 min-w-11 flex items-center justify-center"
                    >
                      Tomar asistencia
                    </Link>
                  )}
                  {!isPast && cls.status === 'scheduled' && (
                    <Link
                      href={`/coach/attendance/${cls.id}`}
                      className="font-body text-sm text-primary font-medium hover:underline min-h-11 min-w-11 flex items-center justify-center"
                    >
                      Ver inscritos
                    </Link>
                  )}
                </div>
              </Card>
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
