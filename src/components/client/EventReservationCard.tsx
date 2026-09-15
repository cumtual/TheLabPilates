import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { formatFullDateTime } from '@/lib/utils/date';
import { getClassDisplayName } from '@/lib/utils/class-type';

export type EventRegistrationStatus = 'pending' | 'confirmed' | 'refund_pending' | 'refunded';

interface EventReservationCardProps {
  classType: string | null;
  customName: string | null;
  classDate: string | null;
  coachName: string | null;
  amountPaid: number;
  status: EventRegistrationStatus;
}

const statusConfig: Record<
  EventRegistrationStatus,
  { variant: 'pending' | 'confirmed' | 'cancelled' | 'expired'; label: string }
> = {
  pending: { variant: 'pending', label: 'Pago pendiente de confirmación' },
  confirmed: { variant: 'confirmed', label: 'Reserva confirmada' },
  refund_pending: { variant: 'cancelled', label: 'Reembolso en proceso' },
  refunded: { variant: 'expired', label: 'Reembolsado' },
};

export function EventReservationCard({
  classType,
  customName,
  classDate,
  coachName,
  amountPaid,
  status,
}: EventReservationCardProps) {
  const config = statusConfig[status];

  return (
    <Card className="border-primary/30 bg-primary/5">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[20px]">event</span>
            <h2 className="font-body text-sm font-semibold text-primary uppercase tracking-wide">
              Tu reserva
            </h2>
          </div>
          <Badge variant={config.variant}>{config.label}</Badge>
        </div>

        <p className="font-body text-xl font-bold text-on-surface">
          {getClassDisplayName(classType, customName)}
        </p>
        <p className="font-body text-base text-on-surface capitalize">
          {classDate ? formatFullDateTime(new Date(classDate), false) : 'Sin fecha'}
        </p>
        {coachName && (
          <p className="font-body text-sm text-on-surface-variant">Coach: {coachName}</p>
        )}
        <p className="font-body text-sm text-on-surface-variant">Monto pagado: ${amountPaid} MXN</p>

        {status === 'pending' && (
          <p className="font-body text-xs text-on-surface-variant">
            Tu lugar se garantizará cuando el administrador confirme tu pago.
          </p>
        )}
        {status === 'refund_pending' && (
          <p className="font-body text-xs text-on-surface-variant">
            El evento fue cancelado. El reembolso de tu pago se procesará de forma manual.
          </p>
        )}
      </div>
    </Card>
  );
}
