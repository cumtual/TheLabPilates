import { and, asc, eq, isNotNull, notInArray } from 'drizzle-orm';
import { db } from '@/db';
import {
  specialEventRegistrations,
  openClasses,
  users,
  payments,
  guestEnrollments,
} from '@/db/schema';

export type SpecialEventHistoryStatus = 'active' | 'cancelled' | 'completed';

export interface SpecialEventRegistrationHistory {
  id: string;
  userName: string;
  userEmail: string;
  createdAt: string | null;
  paymentType: 'cash' | 'transfer' | 'card';
  status: 'pending' | 'confirmed' | 'refund_pending' | 'refunded';
  amountPaid: number;
}

export interface SpecialEventGuestHistory {
  id: string;
  guestName: string;
  origin: 'user' | 'admin';
  status: string;
  registeredByName: string | null;
}

export interface SpecialEventClassHistory {
  id: string;
  classType: string | null;
  customName: string | null;
  classDate: string | null;
  coachName: string | null;
  capacity: number;
  registrations: SpecialEventRegistrationHistory[];
  guests: SpecialEventGuestHistory[];
}

export interface SpecialEventHistoryItem {
  id: string;
  title: string;
  startDate: string | null;
  endDate: string | null;
  status: SpecialEventHistoryStatus;
  showOnLanding: boolean;
  price: number;
  classCount: number;
  confirmedCount: number;
  revenue: number;
  classes: SpecialEventClassHistory[];
}

/**
 * Admin: historial completo de eventos especiales con métricas y participantes.
 *
 * Replica el patrón del panel de clases (`admin/classes/page.tsx`): consultas
 * Drizzle directas + agrupación en memoria con Maps. Ordenado por `startDate DESC`.
 */
export async function getSpecialEventsHistory(): Promise<SpecialEventHistoryItem[]> {
  const events = await db.query.specialEvents.findMany({
    orderBy: (table, { desc: descFn }) => [descFn(table.startDate)],
  });

  if (events.length === 0) return [];

  const classes = await db
    .select({
      id: openClasses.id,
      specialEventId: openClasses.specialEventId,
      classType: openClasses.classType,
      customName: openClasses.customName,
      classDate: openClasses.classDate,
      capacity: openClasses.capacity,
      coachName: users.username,
    })
    .from(openClasses)
    .leftJoin(users, eq(openClasses.coachUserId, users.id))
    .where(isNotNull(openClasses.specialEventId))
    .orderBy(asc(openClasses.classDate));

  const registrations = await db
    .select({
      id: specialEventRegistrations.id,
      specialEventId: specialEventRegistrations.specialEventId,
      openClassId: specialEventRegistrations.openClassId,
      status: specialEventRegistrations.status,
      amountPaid: specialEventRegistrations.amountPaid,
      createdAt: specialEventRegistrations.createdAt,
      paymentType: payments.paymentType,
      userName: users.username,
      userEmail: users.email,
    })
    .from(specialEventRegistrations)
    .innerJoin(users, eq(specialEventRegistrations.userId, users.id))
    .innerJoin(payments, eq(specialEventRegistrations.paymentId, payments.id))
    .orderBy(asc(specialEventRegistrations.createdAt));

  const guests = await db
    .select({
      id: guestEnrollments.id,
      openClassId: guestEnrollments.openClassId,
      guestName: guestEnrollments.guestName,
      origin: guestEnrollments.origin,
      status: guestEnrollments.status,
      registeredByName: users.username,
    })
    .from(guestEnrollments)
    .innerJoin(openClasses, eq(guestEnrollments.openClassId, openClasses.id))
    .leftJoin(users, eq(guestEnrollments.registeredById, users.id))
    .where(
      and(
        isNotNull(openClasses.specialEventId),
        notInArray(guestEnrollments.status, ['cancelled', 'late_cancelled'])
      )
    );

  const registrationsByClass = new Map<string, SpecialEventRegistrationHistory[]>();
  const confirmedCountByEvent = new Map<string, number>();
  const revenueByEvent = new Map<string, number>();

  for (const reg of registrations) {
    const item: SpecialEventRegistrationHistory = {
      id: reg.id,
      userName: reg.userName,
      userEmail: reg.userEmail,
      createdAt: reg.createdAt ? reg.createdAt.toISOString() : null,
      paymentType: reg.paymentType,
      status: reg.status,
      amountPaid: reg.amountPaid,
    };

    if (!registrationsByClass.has(reg.openClassId)) {
      registrationsByClass.set(reg.openClassId, []);
    }
    registrationsByClass.get(reg.openClassId)!.push(item);

    if (reg.status === 'confirmed') {
      confirmedCountByEvent.set(
        reg.specialEventId,
        (confirmedCountByEvent.get(reg.specialEventId) ?? 0) + 1
      );
      revenueByEvent.set(
        reg.specialEventId,
        (revenueByEvent.get(reg.specialEventId) ?? 0) + reg.amountPaid
      );
    }
  }

  const guestsByClass = new Map<string, SpecialEventGuestHistory[]>();
  for (const guest of guests) {
    if (!guestsByClass.has(guest.openClassId)) {
      guestsByClass.set(guest.openClassId, []);
    }
    guestsByClass.get(guest.openClassId)!.push({
      id: guest.id,
      guestName: guest.guestName,
      origin: guest.origin,
      status: guest.status ?? 'pending',
      registeredByName: guest.registeredByName,
    });
  }

  const classesByEvent = new Map<string, SpecialEventClassHistory[]>();
  for (const cls of classes) {
    if (!cls.specialEventId) continue;
    if (!classesByEvent.has(cls.specialEventId)) {
      classesByEvent.set(cls.specialEventId, []);
    }
    classesByEvent.get(cls.specialEventId)!.push({
      id: cls.id,
      classType: cls.classType,
      customName: cls.customName,
      classDate: cls.classDate ? cls.classDate.toISOString() : null,
      coachName: cls.coachName,
      capacity: cls.capacity ?? 0,
      registrations: registrationsByClass.get(cls.id) ?? [],
      guests: guestsByClass.get(cls.id) ?? [],
    });
  }

  return events.map((event) => {
    const eventClasses = classesByEvent.get(event.id) ?? [];
    return {
      id: event.id,
      title: event.title,
      startDate: event.startDate ? event.startDate.toISOString() : null,
      endDate: event.endDate ? event.endDate.toISOString() : null,
      status: event.status,
      showOnLanding: event.showOnLanding,
      price: event.price,
      classCount: eventClasses.length,
      confirmedCount: confirmedCountByEvent.get(event.id) ?? 0,
      revenue: revenueByEvent.get(event.id) ?? 0,
      classes: eventClasses,
    };
  });
}
