import { eq, and } from 'drizzle-orm';
import { db } from '@/db';
import {
  userSubscriptions,
  payments,
  subscriptions,
  specialEventRegistrations,
  specialEvents,
} from '@/db/schema';

export interface PendingTransfer {
  kind: 'subscription' | 'event';
  concept: string;
  amount: number;
}

interface PendingTransferRow extends PendingTransfer {
  createdAt: Date | null;
}

/**
 * Fetches the authenticated user's pending payments made via bank transfer,
 * for both subscription packages and special event registrations.
 *
 * A payment is considered pending when `payments.confirmed === false` and
 * `payments.paymentType === 'transfer'`. Amounts live outside `payments`:
 * subscriptions use `subscriptions.price`, events use
 * `specialEventRegistrations.amountPaid`.
 *
 * Results are sorted by most recent first. Both kinds may coexist.
 */
export async function getPendingTransferPayments(
  userId: string
): Promise<PendingTransfer[]> {
  const subscriptionRows = await db
    .select({
      concept: subscriptions.name,
      amount: subscriptions.price,
      createdAt: payments.createdAt,
    })
    .from(userSubscriptions)
    .innerJoin(payments, eq(userSubscriptions.paymentId, payments.id))
    .innerJoin(
      subscriptions,
      eq(userSubscriptions.subscriptionId, subscriptions.id)
    )
    .where(
      and(
        eq(userSubscriptions.userId, userId),
        eq(payments.confirmed, false),
        eq(payments.paymentType, 'transfer')
      )
    );

  const eventRows = await db
    .select({
      concept: specialEvents.title,
      amount: specialEventRegistrations.amountPaid,
      createdAt: specialEventRegistrations.createdAt,
    })
    .from(specialEventRegistrations)
    .innerJoin(
      payments,
      eq(specialEventRegistrations.paymentId, payments.id)
    )
    .innerJoin(
      specialEvents,
      eq(specialEventRegistrations.specialEventId, specialEvents.id)
    )
    .where(
      and(
        eq(specialEventRegistrations.userId, userId),
        eq(specialEventRegistrations.status, 'pending'),
        eq(payments.confirmed, false),
        eq(payments.paymentType, 'transfer')
      )
    );

  const rows: PendingTransferRow[] = [
    ...subscriptionRows.map((row) => ({
      kind: 'subscription' as const,
      concept: row.concept ?? 'Suscripción',
      amount: row.amount ?? 0,
      createdAt: row.createdAt,
    })),
    ...eventRows.map((row) => ({
      kind: 'event' as const,
      concept: row.concept,
      amount: row.amount,
      createdAt: row.createdAt,
    })),
  ];

  rows.sort(
    (a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0)
  );

  return rows.map(({ kind, concept, amount }) => ({ kind, concept, amount }));
}
