import { redirect } from 'next/navigation';
import { desc } from 'drizzle-orm';
import { getSession } from '@/lib/auth/session';
import { db } from '@/db';
import { payments, userSubscriptions, users, subscriptions } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { PaymentManagement } from '@/components/admin/PaymentManagement';

function formatDate(date: Date): string {
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

export default async function AdminPaymentsPage() {
  const session = await getSession();
  if (!session || session.role !== 'admin') redirect('/login');

  // Fetch ALL payments (client handles filters + pagination)
  const results = await db
    .select({
      paymentId: payments.id,
      paymentType: payments.paymentType,
      confirmed: payments.confirmed,
      dateConfirmed: payments.dateConfirmed,
      createdAt: payments.createdAt,
      clientName: users.username,
      clientEmail: users.email,
      subscriptionName: subscriptions.name,
      amount: subscriptions.price,
    })
    .from(payments)
    .innerJoin(userSubscriptions, eq(userSubscriptions.paymentId, payments.id))
    .innerJoin(users, eq(userSubscriptions.userId, users.id))
    .leftJoin(subscriptions, eq(userSubscriptions.subscriptionId, subscriptions.id))
    .orderBy(desc(payments.createdAt));

  const allPayments = results.map((row) => ({
    paymentId: row.paymentId,
    clientName: row.clientName,
    clientEmail: row.clientEmail,
    paymentType: row.paymentType as 'cash' | 'transfer' | 'card',
    confirmed: row.confirmed ?? false,
    amount: row.amount,
    createdAt: row.createdAt ? formatDate(new Date(row.createdAt)) : '--/--/----',
    createdAtRaw: row.createdAt ? row.createdAt.toISOString() : null,
    dateConfirmed: row.dateConfirmed ? formatDate(new Date(row.dateConfirmed)) : null,
    subscriptionName: row.subscriptionName,
  }));

  return (
    <div className="space-y-6">
      <h1 className="font-headline text-headline-lg-mobile text-on-surface py-6">
        Gestión de Pagos
      </h1>
      <PaymentManagement payments={allPayments} />
    </div>
  );
}
