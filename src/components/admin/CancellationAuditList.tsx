import { Card } from '@/components/ui/Card';
import { isCancelledEnrollmentStatus } from '@/lib/enrollment/cancellation';
import type { AdminEnrollmentAuditRow } from '@/lib/queries/admin-enrollment-audit';

interface CancellationAuditListProps {
  rows: AdminEnrollmentAuditRow[];
}

/**
 * Historial de cancelaciones de una clase con fecha/hora de reserva y de
 * cancelación (CDMX). EXCLUSIVO del panel admin: recibe filas ya serializadas
 * por getClassEnrollmentAudit (SPEC-CANCELLATION-AUDIT-AND-TERMS §4.2).
 */
export function CancellationAuditList({ rows }: CancellationAuditListProps) {
  const cancelled = rows.filter((row) => isCancelledEnrollmentStatus(row.status));
  if (cancelled.length === 0) return null;

  return (
    <div className="mt-8">
      <h2 className="font-headline text-title-md text-on-surface-variant mb-3">
        Cancelaciones ({cancelled.length})
      </h2>
      <div className="space-y-2">
        {cancelled.map((row) => (
          <div key={row.enrollmentId} data-testid={`cancellation-${row.enrollmentId}`}>
            <Card className="flex items-center gap-3 opacity-70">
              <div className="flex-1 min-w-0">
                <p className="font-body text-sm font-semibold text-on-surface truncate">{row.name}</p>
                <p className="font-body text-xs text-on-surface-variant truncate">{row.detail}</p>
                <p className="font-body text-xs text-outline">Reservó: {row.bookedAt}</p>
                <p className="font-body text-xs text-outline">Canceló: {row.cancelledAt}</p>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                {row.kind === 'guest' && (
                  <span className="font-body text-xs px-2 py-1 rounded bg-surface-container-low text-outline">
                    Invitado
                  </span>
                )}
                <span
                  className={`font-body text-xs px-2 py-1 rounded ${
                    row.status === 'late_cancelled'
                      ? 'bg-error/10 text-error'
                      : 'bg-surface-container-low text-outline'
                  }`}
                >
                  {row.status === 'late_cancelled' ? 'Cancelación tardía' : 'Canceló'}
                </span>
              </div>
            </Card>
          </div>
        ))}
      </div>
    </div>
  );
}
