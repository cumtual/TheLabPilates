'use client';

import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import type { GuestEnrollment } from '@/lib/types/guest';

interface AdminGuestListProps {
  guests: GuestEnrollment[];
  onRemove?: (guestId: string) => void;
}

const statusLabels: Record<string, string> = {
  pending: 'Pendiente',
  attended: 'Asistió',
  absent: 'Ausente',
  late_cancelled: 'Cancel. tardía',
  cancelled: 'Cancelado',
};

const statusBadgeVariant: Record<string, 'pending' | 'confirmed' | 'absent' | 'cancelled' | 'expired'> = {
  pending: 'pending',
  attended: 'confirmed',
  absent: 'absent',
  late_cancelled: 'cancelled',
  cancelled: 'cancelled',
};

export function AdminGuestList({ guests, onRemove }: AdminGuestListProps) {
  if (guests.length === 0) {
    return (
      <Card>
        <p className="font-body text-sm text-outline text-center py-8">
          No hay invitados registrados en esta clase.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {guests.map((guest) => (
        <Card key={guest.id}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1 flex-1 min-w-0">
              <p className="font-body text-sm font-semibold text-on-surface break-words">
                {guest.guestName}
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge
                  variant={guest.origin === 'admin' ? 'expired' : 'confirmed'}
                >
                  {guest.origin === 'admin' ? 'Admin' : 'Usuario'}
                </Badge>
                <Badge
                  variant={statusBadgeVariant[guest.status] ?? 'pending'}
                >
                  {statusLabels[guest.status] ?? guest.status}
                </Badge>
              </div>
            </div>

            {guest.origin === 'admin' && onRemove && (
              <button
                type="button"
                onClick={() => onRemove(guest.id)}
                className="inline-flex items-center justify-center px-3 py-2 font-body text-sm font-medium text-error border border-error/30 rounded-lg transition-all duration-200 ease-out hover:bg-error/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-error min-h-11 min-w-11"
                aria-label={`Eliminar invitado ${guest.guestName}`}
              >
                Eliminar
              </button>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}
