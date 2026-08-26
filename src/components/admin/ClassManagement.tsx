'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { cancelClassAction } from '@/actions/admin';
import { formatFriendlyDate, formatRelativeDate } from '@/lib/utils/date';
import { getClassDisplayName } from '@/lib/utils/class-type';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { Pagination } from '@/components/ui/Pagination';

const CLIENT_PAGE_SIZE = 10;

interface EnrolledStudent {
  isGuest?: boolean;
  origin?: string;
  name: string;
  email: string;
  status: string | null;
}

interface ClassItem {
  id: string;
  classDate: string | null;
  classType: string | null;
  customName: string | null;
  status: string | null;
  capacity: number | null;
  coachName: string;
  enrollmentCount: number;
  enrolledStudents: EnrolledStudent[];
}

interface ClassManagementProps {
  classes: ClassItem[];
}

type StatusFilter = 'all' | 'scheduled' | 'completed' | 'cancelled';

const statusLabels: Record<string, string> = {
  scheduled: 'Programada',
  cancelled: 'Cancelada',
  completed: 'Completada',
};

const statusVariants: Record<string, BadgeVariant> = {
  scheduled: 'active',
  cancelled: 'cancelled',
  completed: 'confirmed',
};

const filterLabels: Record<StatusFilter, string> = {
  all: 'Todas',
  scheduled: 'Programadas',
  completed: 'Completadas',
  cancelled: 'Canceladas',
};

const enrollmentStatusLabels: Record<string, string> = {
  pending: 'Pendiente',
  attended: 'Asistió',
  absent: 'Ausente',
  late_cancelled: 'Cancel. tardía',
  cancelled: 'Cancelada',
};

const enrollmentStatusVariants: Record<string, BadgeVariant> = {
  pending: 'pending',
  attended: 'confirmed',
  absent: 'absent',
  late_cancelled: 'cancelled',
  cancelled: 'cancelled',
};

export default function ClassManagement({ classes }: ClassManagementProps) {
  const [isPending, startTransition] = useTransition();
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [clientPage, setClientPage] = useState(1);

  const filteredClasses = filter === 'all'
    ? classes
    : classes.filter((cls) => cls.status === filter);

  const totalClientPages = Math.ceil(filteredClasses.length / CLIENT_PAGE_SIZE);
  const paginatedClasses = filteredClasses.slice(
    (clientPage - 1) * CLIENT_PAGE_SIZE,
    clientPage * CLIENT_PAGE_SIZE
  );

  // Counts come from ALL data (not just the current page)
  const counts: Record<StatusFilter, number> = {
    all: classes.length,
    scheduled: classes.filter((c) => c.status === 'scheduled').length,
    completed: classes.filter((c) => c.status === 'completed').length,
    cancelled: classes.filter((c) => c.status === 'cancelled').length,
  };

  function handleCancel(classId: string) {
    setCancellingId(classId);
    setMessage(null);

    startTransition(async () => {
      const result = await cancelClassAction(classId);
      setCancellingId(null);

      if (result.success) {
        setMessage({ type: 'success', text: result.message ?? 'Clase cancelada.' });
      } else {
        setMessage({ type: 'error', text: result.error });
      }
    });
  }

  function toggleExpand(classId: string) {
    setExpandedId(expandedId === classId ? null : classId);
  }

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

      {message && (
        <div
          className={`p-3 rounded-lg text-sm ${
            message.type === 'success'
              ? 'bg-primary/10 text-primary border border-primary/30'
              : 'bg-error/10 text-error border border-error/30'
          }`}
          role="alert"
        >
          {message.text}
        </div>
      )}

      {filteredClasses.length === 0 ? (
        <p className="text-center text-on-surface-variant py-8 font-body">
          {filter === 'all' ? 'No hay clases registradas.' : `No hay clases ${filterLabels[filter].toLowerCase()}.`}
        </p>
      ) : (
        <div className="space-y-3">
          {paginatedClasses.map((classItem) => {
            const isExpanded = expandedId === classItem.id;
            const relative = formatRelativeDate(classItem.classDate);

            return (
              <div
                key={classItem.id}
                className="bg-surface rounded-lg border border-outline-variant/40 overflow-hidden"
              >
                {/* Header */}
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-body font-semibold text-on-surface">
                          {getClassDisplayName(classItem.classType, classItem.customName)}
                        </h3>
                        <Badge variant={statusVariants[classItem.status ?? ''] ?? 'pending'}>
                          {statusLabels[classItem.status ?? ''] ?? classItem.status}
                        </Badge>
                      </div>
                      <p className="font-body text-sm text-on-surface-variant mt-1 capitalize">
                        {formatFriendlyDate(classItem.classDate)}
                      </p>
                      {relative && (
                        <p className="font-body text-xs text-primary font-medium">
                          {relative}
                        </p>
                      )}
                      <p className="font-body text-sm text-on-surface-variant mt-1">
                        Coach: {classItem.coachName}
                      </p>
                      <p className="font-body text-sm text-on-surface-variant">
                        Inscritos: {classItem.enrolledStudents.length}/{classItem.capacity ?? 0}
                      </p>
                    </div>

                    <div className="flex flex-col gap-2 items-end">
                      {classItem.status === 'scheduled' && (
                        <button
                          onClick={() => handleCancel(classItem.id)}
                          disabled={isPending && cancellingId === classItem.id}
                          className="min-w-11 min-h-11 px-3 py-2 bg-red-800 text-on-error text-sm rounded-lg hover:bg-error/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-white font-bold cursor-pointer"
                        >
                          {isPending && cancellingId === classItem.id ? 'Cancelando...' : 'Cancelar'}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Toggle inscritos */}
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    {classItem.enrolledStudents.length > 0 && (
                      <button
                        type="button"
                        onClick={() => toggleExpand(classItem.id)}
                        className="inline-flex items-center gap-1 font-body text-sm text-primary font-medium hover:underline min-h-11"
                      >
                        <span className="material-symbols-outlined text-[18px] transition-transform" style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                          expand_more
                        </span>
                        {isExpanded ? 'Ocultar inscritos' : `Ver inscritos (${classItem.enrolledStudents.length})`}
                      </button>
                    )}
                    <Link
                      href={`/admin/attendance/${classItem.id}`}
                      className="inline-flex items-center gap-1 font-body text-sm text-secondary font-medium hover:underline min-h-11"
                    >
                      <span className="material-symbols-outlined text-[18px]">assignment</span>
                      Asistencia
                    </Link>
                  </div>
                </div>

                {/* Lista de inscritos expandible */}
                {isExpanded && classItem.enrolledStudents.length > 0 && (
                  <div className="border-t border-outline-variant/40 bg-surface-container-low px-4 py-3">
                    <div className="space-y-2">
                      {classItem.enrolledStudents.map((student, idx) => (
                        <div
                          key={idx}
                          className={`flex items-center justify-between gap-2 py-2 border-b border-outline-variant/20 last:border-b-0 ${student.isGuest ? "pl-3 border-l-2 border-l-primary/40" : ""}`}
                        >
                          <div className="min-w-0">
                            <p className="font-body text-sm font-medium text-on-surface truncate">
                              {student.name}
                            </p>
                            <p className="font-body text-xs text-outline truncate">
                              {student.email}
                            </p>
                          </div>
                          <Badge variant={enrollmentStatusVariants[student.status ?? ''] ?? 'pending'}>
                            {enrollmentStatusLabels[student.status ?? ''] ?? student.status ?? 'Pendiente'}
                          </Badge>
                        </div>
                      ))}
                    </div>
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
