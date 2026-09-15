'use client';

import { useRouter } from 'next/navigation';
import { EventRegistrationRow, type EventRegistrationItem } from '@/components/admin/EventRegistrationRow';
import { AdminAddGuestForm } from '@/components/admin/AdminAddGuestForm';
import { AdminRemoveGuestButton } from '@/components/admin/AdminRemoveGuestButton';
import { formatFullDateTime } from '@/lib/utils/date';
import { getClassDisplayName } from '@/lib/utils/class-type';
import type { GuestOrigin, EnrollmentStatus } from '@/lib/types/guest';

export interface EventClassData {
  id: string;
  classType: string | null;
  customName: string | null;
  classDate: string | null;
  coachName: string | null;
  capacity: number;
  occupied: number;
}

export interface EventGuestItem {
  id: string;
  guestName: string;
  origin: GuestOrigin;
  status: EnrollmentStatus;
  registeredById: string;
  registeredByName: string | null;
}

interface EventClassPanelProps {
  classData: EventClassData;
  registrations: EventRegistrationItem[];
  guests: EventGuestItem[];
  allowGuests: boolean;
}

export function EventClassPanel({ classData, registrations, guests, allowGuests }: EventClassPanelProps) {
  const router = useRouter();
  const spotsLeft = Math.max(0, classData.capacity - classData.occupied);

  return (
    <section className="rounded-lg border border-outline-variant/40 bg-surface-container-low p-5 space-y-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-headline text-title-md text-on-surface">
            {getClassDisplayName(classData.classType, classData.customName)}
          </h3>
          <p className="font-body text-sm text-on-surface-variant capitalize">
            {classData.classDate ? formatFullDateTime(new Date(classData.classDate)) : 'Sin fecha'}
            {classData.coachName ? ` · Coach: ${classData.coachName}` : ''}
          </p>
        </div>
        <p className="font-body text-sm font-semibold text-on-surface">
          {classData.occupied}/{classData.capacity} lugares
          {spotsLeft === 0 && <span className="text-error"> · LLENO</span>}
        </p>
      </div>

      <div className="space-y-3">
        <h4 className="font-body text-sm font-semibold text-on-surface uppercase tracking-wide">
          Inscritos ({registrations.length})
        </h4>
        {registrations.length === 0 ? (
          <p className="font-body text-sm text-outline text-center py-3">
            Aún no hay inscritos.
          </p>
        ) : (
          <div className="space-y-3">
            {registrations.map((reg) => (
              <EventRegistrationRow key={reg.id} registration={reg} />
            ))}
          </div>
        )}
      </div>

      <div className="space-y-3 border-t border-outline-variant/40 pt-4">
        <h4 className="font-body text-sm font-semibold text-on-surface uppercase tracking-wide">
          Invitados ({guests.length})
        </h4>
        {guests.length === 0 ? (
          <p className="font-body text-sm text-outline text-center py-3">
            No hay invitados registrados en esta clase.
          </p>
        ) : (
          <div className="space-y-3">
            {guests.map((guest) => (
              <div
                key={guest.id}
                className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-lg border border-outline-variant/40 bg-surface p-4"
              >
                <div className="space-y-1 flex-1">
                  <p className="font-body text-sm font-semibold text-on-surface">{guest.guestName}</p>
                  <p className="font-body text-xs text-on-surface-variant">
                    {guest.origin === 'admin' ? 'Registrado por Admin' : 'Invitado por usuario'}
                    {guest.registeredByName ? ` (${guest.registeredByName})` : ''}
                  </p>
                </div>
                {guest.origin === 'admin' && (
                  <AdminRemoveGuestButton
                    guestEnrollmentId={guest.id}
                    guestName={guest.guestName}
                    origin={guest.origin}
                    onSuccess={() => router.refresh()}
                  />
                )}
              </div>
            ))}
          </div>
        )}

        {allowGuests && <AdminAddGuestForm classId={classData.id} onSuccess={() => router.refresh()} />}
      </div>
    </section>
  );
}
