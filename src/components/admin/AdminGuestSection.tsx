'use client';

import { useRouter } from 'next/navigation';
import { AdminAddGuestForm } from '@/components/admin/AdminAddGuestForm';
import { AdminRemoveGuestButton } from '@/components/admin/AdminRemoveGuestButton';
import type { GuestOrigin, EnrollmentStatus } from '@/lib/types/guest';

export interface AdminGuestData {
  id: string;
  guestName: string;
  origin: GuestOrigin;
  status: EnrollmentStatus;
  registeredById: string;
  registeredByName: string | null;
}

interface AdminGuestSectionProps {
  classId: string;
  guests: AdminGuestData[];
}

/**
 * Client wrapper that integrates AdminGuestList, AdminAddGuestForm,
 * and AdminRemoveGuestButton into the admin class detail page.
 *
 * Uses router.refresh() after add/remove operations to revalidate server data.
 *
 * Requirements: 6.1, 6.4, 6.7
 */
export function AdminGuestSection({ classId, guests }: AdminGuestSectionProps) {
  const router = useRouter();

  function handleSuccess() {
    router.refresh();
  }

  return (
    <section aria-labelledby="admin-guest-section-heading">
      <h2
        id="admin-guest-section-heading"
        className="font-headline text-title-md text-on-surface mb-3"
      >
        Invitados ({guests.length})
      </h2>

      {/* Guest list with remove buttons for admin-origin guests */}
      <div className="mb-4">
        {guests.length === 0 ? (
          <p className="font-body text-sm text-outline text-center py-4">
            No hay invitados registrados en esta clase.
          </p>
        ) : (
          <div className="space-y-3">
            {guests.map((guest) => (
              <div
                key={guest.id}
                className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-lg border border-outline/20 bg-surface-container-low p-4"
              >
                <div className="space-y-1 flex-1">
                  <p className="font-body text-sm font-semibold text-on-surface">
                    {guest.guestName}
                  </p>
                  <p className="font-body text-xs text-on-surface-variant">
                    {guest.origin === 'admin'
                      ? 'Registrado por Admin'
                      : 'Invitado por usuario'}
                    {guest.registeredByName ? ` (${guest.registeredByName})` : ''}
                  </p>
                </div>

                {guest.origin === 'admin' && (
                  <AdminRemoveGuestButton
                    guestEnrollmentId={guest.id}
                    guestName={guest.guestName}
                    origin={guest.origin}
                    onSuccess={handleSuccess}
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Form to add a new guest */}
      <AdminAddGuestForm classId={classId} onSuccess={handleSuccess} />
    </section>
  );
}
