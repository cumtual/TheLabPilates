import { notFound, redirect } from 'next/navigation';
import { eq, and, or, asc, inArray, notInArray, isNull } from 'drizzle-orm';
import { getSession } from '@/lib/auth/session';
import { db } from '@/db';
import {
  specialEvents,
  specialEventRegistrations,
  openClasses,
  users,
  payments,
  guestEnrollments,
} from '@/db/schema';
import { Badge } from '@/components/ui/Badge';
import { EventActions } from '@/components/admin/EventActions';
import { AddEventClassForm } from '@/components/admin/AddEventClassForm';
import { EventClassPanel, type EventGuestItem } from '@/components/admin/EventClassPanel';
import type { EventRegistrationItem } from '@/components/admin/EventRegistrationRow';
import { formatFullDateTime } from '@/lib/utils/date';

export default async function AdminEventDetailPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role !== 'admin') redirect('/login');

  const { eventId } = await params;

  const event = await db.query.specialEvents.findFirst({
    where: eq(specialEvents.id, eventId),
  });
  if (!event) notFound();

  const classes = await db
    .select({
      id: openClasses.id,
      classDate: openClasses.classDate,
      classType: openClasses.classType,
      customName: openClasses.customName,
      capacity: openClasses.capacity,
      status: openClasses.status,
      coachName: users.username,
    })
    .from(openClasses)
    .leftJoin(users, eq(openClasses.coachUserId, users.id))
    .where(eq(openClasses.specialEventId, eventId))
    .orderBy(asc(openClasses.classDate));

  const classIds = classes.map((c) => c.id);

  const registrations = await db
    .select({
      id: specialEventRegistrations.id,
      openClassId: specialEventRegistrations.openClassId,
      status: specialEventRegistrations.status,
      amountPaid: specialEventRegistrations.amountPaid,
      paymentType: payments.paymentType,
      userName: users.username,
      userEmail: users.email,
    })
    .from(specialEventRegistrations)
    .innerJoin(users, eq(specialEventRegistrations.userId, users.id))
    .innerJoin(payments, eq(specialEventRegistrations.paymentId, payments.id))
    .where(eq(specialEventRegistrations.specialEventId, eventId))
    .orderBy(asc(specialEventRegistrations.createdAt));

  const guests = classIds.length
    ? await db
        .select({
          id: guestEnrollments.id,
          openClassId: guestEnrollments.openClassId,
          guestName: guestEnrollments.guestName,
          origin: guestEnrollments.origin,
          status: guestEnrollments.status,
          registeredById: guestEnrollments.registeredById,
          registeredByName: users.username,
        })
        .from(guestEnrollments)
        .leftJoin(users, eq(guestEnrollments.registeredById, users.id))
        .where(
          and(
            inArray(guestEnrollments.openClassId, classIds),
            notInArray(guestEnrollments.status, ['cancelled', 'late_cancelled'])
          )
        )
    : [];

  const coaches = await db.query.users.findMany({
    where: and(
      or(eq(users.role, 'coach'), eq(users.role, 'admin')),
      isNull(users.deletedAt)
    ),
    orderBy: (table, { asc: ascFn }) => [ascFn(table.username)],
  });

  const registrationsByClass = new Map<string, EventRegistrationItem[]>();
  for (const reg of registrations) {
    if (!registrationsByClass.has(reg.openClassId)) {
      registrationsByClass.set(reg.openClassId, []);
    }
    registrationsByClass.get(reg.openClassId)!.push({
      id: reg.id,
      userName: reg.userName,
      userEmail: reg.userEmail,
      amountPaid: reg.amountPaid,
      paymentType: reg.paymentType,
      status: reg.status,
    });
  }

  const guestsByClass = new Map<string, EventGuestItem[]>();
  for (const guest of guests) {
    if (!guestsByClass.has(guest.openClassId)) {
      guestsByClass.set(guest.openClassId, []);
    }
    guestsByClass.get(guest.openClassId)!.push({
      id: guest.id,
      guestName: guest.guestName,
      origin: guest.origin,
      status: guest.status ?? 'pending',
      registeredById: guest.registeredById,
      registeredByName: guest.registeredByName,
    });
  }

  const confirmedByClass = new Map<string, number>();
  for (const reg of registrations) {
    if (reg.status === 'confirmed') {
      confirmedByClass.set(reg.openClassId, (confirmedByClass.get(reg.openClassId) ?? 0) + 1);
    }
  }

  const statusLabel =
    event.status === 'active' ? 'Activo' : event.status === 'cancelled' ? 'Cancelado' : 'Finalizado';
  const statusVariant =
    event.status === 'active' ? 'active' : event.status === 'cancelled' ? 'cancelled' : 'expired';

  const allowGuests = event.status === 'active';

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="font-headline text-headline-lg-mobile text-on-surface">{event.title}</h1>
          <Badge variant={statusVariant}>{statusLabel}</Badge>
          {event.status === 'active' && event.showOnLanding && (
            <Badge variant="confirmed">En landing</Badge>
          )}
        </div>

        <p className="font-body text-body-md text-on-surface-variant">{event.description}</p>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="font-body text-outline">Inicio</p>
            <p className="font-body text-on-surface capitalize">
              {event.startDate ? formatFullDateTime(new Date(event.startDate)) : 'Sin fecha'}
            </p>
          </div>
          <div>
            <p className="font-body text-outline">Fin</p>
            <p className="font-body text-on-surface capitalize">
              {event.endDate ? formatFullDateTime(new Date(event.endDate)) : 'Sin fecha'}
            </p>
          </div>
          <div>
            <p className="font-body text-outline">Precio base</p>
            <p className="font-body text-on-surface">${event.price} MXN</p>
          </div>
          <div>
            <p className="font-body text-outline">Descripción breve (landing)</p>
            <p className="font-body text-on-surface">{event.shortDescription}</p>
          </div>
        </div>

        <EventActions eventId={event.id} status={event.status} showOnLanding={event.showOnLanding} />
      </div>

      <div className="space-y-4">
        <h2 className="font-headline text-title-md text-on-surface">
          Clases del evento ({classes.length})
        </h2>
        {classes.length === 0 ? (
          <p className="font-body text-sm text-outline">Este evento aún no tiene clases.</p>
        ) : (
          <div className="space-y-4">
            {classes.map((cls) => {
              const classRegs = registrationsByClass.get(cls.id) ?? [];
              const classGuests = guestsByClass.get(cls.id) ?? [];
              const occupied = (confirmedByClass.get(cls.id) ?? 0) + classGuests.length;
              return (
                <EventClassPanel
                  key={cls.id}
                  classData={{
                    id: cls.id,
                    classType: cls.classType,
                    customName: cls.customName,
                    classDate: cls.classDate ? cls.classDate.toISOString() : null,
                    coachName: cls.coachName,
                    capacity: cls.capacity ?? 0,
                    occupied,
                  }}
                  registrations={classRegs}
                  guests={classGuests}
                  allowGuests={allowGuests}
                />
              );
            })}
          </div>
        )}
      </div>

      {allowGuests && (
        <div className="border-t border-outline-variant/40 pt-6">
          <h2 className="font-headline text-title-md text-on-surface mb-4">Agregar Clase</h2>
          <AddEventClassForm
            eventId={event.id}
            coaches={coaches.map((c) => ({ id: c.id, username: c.username, email: c.email }))}
            eventStart={event.startDate ? event.startDate.toISOString() : null}
            eventEnd={event.endDate ? event.endDate.toISOString() : null}
          />
        </div>
      )}
    </div>
  );
}
