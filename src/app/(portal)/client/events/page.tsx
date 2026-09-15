import { redirect } from 'next/navigation';
import { eq, and, asc, desc } from 'drizzle-orm';
import { getSession } from '@/lib/auth/session';
import { db } from '@/db';
import {
  specialEvents,
  specialEventRegistrations,
  openClasses,
  users,
  payments,
  debitCards,
} from '@/db/schema';
import { Card } from '@/components/ui/Card';
import {
  SpecialEventPurchase,
  type EventClassOption,
} from '@/components/client/SpecialEventPurchase';
import { EventReservationCard } from '@/components/client/EventReservationCard';
import { computeEventPrice, getEventClassAvailable } from '@/lib/events/capacity';
import { formatFullDateTime } from '@/lib/utils/date';

async function getActiveEvent() {
  return db.query.specialEvents.findFirst({
    where: eq(specialEvents.status, 'active'),
    orderBy: (table, { asc: ascFn }) => [ascFn(table.startDate)],
  });
}

async function getUserRegistration(userId: string, eventId?: string) {
  const conditions = eventId
    ? and(
        eq(specialEventRegistrations.userId, userId),
        eq(specialEventRegistrations.specialEventId, eventId)
      )
    : eq(specialEventRegistrations.userId, userId);

  const rows = await db
    .select({
      registration: specialEventRegistrations,
      event: specialEvents,
      openClass: openClasses,
      paymentType: payments.paymentType,
      coachName: users.username,
    })
    .from(specialEventRegistrations)
    .innerJoin(specialEvents, eq(specialEventRegistrations.specialEventId, specialEvents.id))
    .innerJoin(openClasses, eq(specialEventRegistrations.openClassId, openClasses.id))
    .innerJoin(payments, eq(specialEventRegistrations.paymentId, payments.id))
    .leftJoin(users, eq(openClasses.coachUserId, users.id))
    .where(conditions)
    .orderBy(desc(specialEventRegistrations.createdAt))
    .limit(1);

  return rows[0] ?? null;
}

async function getEventClasses(eventId: string): Promise<EventClassOption[]> {
  const classes = await db
    .select({
      id: openClasses.id,
      classType: openClasses.classType,
      customName: openClasses.customName,
      classDate: openClasses.classDate,
      coachName: users.username,
    })
    .from(openClasses)
    .leftJoin(users, eq(openClasses.coachUserId, users.id))
    .where(and(eq(openClasses.specialEventId, eventId), eq(openClasses.status, 'scheduled')))
    .orderBy(asc(openClasses.classDate));

  return Promise.all(
    classes.map(async (cls) => ({
      id: cls.id,
      classType: cls.classType,
      customName: cls.customName,
      classDate: cls.classDate ? cls.classDate.toISOString() : null,
      coachName: cls.coachName,
      available: await getEventClassAvailable(cls.id),
    }))
  );
}

export default async function ClientEventsPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const activeEvent = await getActiveEvent();
  const registration = activeEvent
    ? await getUserRegistration(session.sub, activeEvent.id)
    : await getUserRegistration(session.sub);

  const displayEvent = activeEvent ?? registration?.event ?? null;

  const activeCard = await db.query.debitCards.findFirst({
    where: eq(debitCards.active, true),
  });

  if (!displayEvent) {
    return (
      <div className="space-y-6">
        <h1 className="font-headline text-headline-lg-mobile text-on-surface py-6">Eventos Especiales</h1>
        <Card>
          <p className="font-body text-body-md text-on-surface-variant text-center py-6">
            No hay eventos especiales disponibles por el momento. Vuelve pronto.
          </p>
        </Card>
      </div>
    );
  }

  // Already purchased: show reservation status card only.
  if (registration) {
    return (
      <div className="space-y-6">
        <h1 className="font-headline text-headline-lg-mobile text-on-surface py-6">Eventos Especiales</h1>

        <div className="space-y-2">
          <h2 className="font-headline text-title-md text-on-surface">{displayEvent.title}</h2>
          <p className="font-body text-body-md text-on-surface-variant">{displayEvent.description}</p>
          <p className="font-body text-sm text-on-surface-variant capitalize">
            {displayEvent.startDate ? formatFullDateTime(new Date(displayEvent.startDate)) : ''}
            {displayEvent.endDate ? ` — ${formatFullDateTime(new Date(displayEvent.endDate))}` : ''}
          </p>
        </div>

        <EventReservationCard
          classType={registration.openClass.classType}
          customName={registration.openClass.customName}
          classDate={registration.openClass.classDate ? registration.openClass.classDate.toISOString() : null}
          coachName={registration.coachName}
          amountPaid={registration.registration.amountPaid}
          status={registration.registration.status}
        />
      </div>
    );
  }

  // No active event to purchase.
  if (!activeEvent) {
    return (
      <div className="space-y-6">
        <h1 className="font-headline text-headline-lg-mobile text-on-surface py-6">Eventos Especiales</h1>
        <Card>
          <p className="font-body text-body-md text-on-surface-variant text-center py-6">
            No hay eventos especiales disponibles por el momento. Vuelve pronto.
          </p>
        </Card>
      </div>
    );
  }

  const finalPrice = await computeEventPrice(activeEvent, session.sub);
  const classes = await getEventClasses(activeEvent.id);

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="font-headline text-headline-lg-mobile text-on-surface py-6">Eventos Especiales</h1>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary text-[20px]">celebration</span>
          <h2 className="font-headline text-title-md text-on-surface">{activeEvent.title}</h2>
        </div>
        <p className="font-body text-body-md text-on-surface-variant">{activeEvent.description}</p>
        <p className="font-body text-sm text-on-surface-variant capitalize">
          {activeEvent.startDate ? formatFullDateTime(new Date(activeEvent.startDate)) : ''}
          {activeEvent.endDate ? ` — ${formatFullDateTime(new Date(activeEvent.endDate))}` : ''}
        </p>
      </div>

      <SpecialEventPurchase
        eventId={activeEvent.id}
        basePrice={activeEvent.price}
        finalPrice={finalPrice}
        classes={classes}
        activeCard={
          activeCard
            ? {
                cardName: activeCard.cardName,
                cardNumber: activeCard.cardNumber,
                cardBank: activeCard.cardBank,
              }
            : null
        }
      />
    </div>
  );
}
