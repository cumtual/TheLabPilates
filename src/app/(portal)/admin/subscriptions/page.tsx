import { redirect } from 'next/navigation';
import { desc } from 'drizzle-orm';
import { getSession } from '@/lib/auth/session';
import { db } from '@/db';
import { userSubscriptions, users, subscriptions } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { SubscriptionManagement } from '@/components/admin/SubscriptionManagement';

function formatDate(date: Date): string {
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

export default async function AdminSubscriptionsPage() {
  const session = await getSession();
  if (!session || session.role !== 'admin') redirect('/login');

  // Fetch ALL subscriptions (active + suspended) for filtering client-side
  const results = await db
    .select({
      subscriptionId: userSubscriptions.id,
      userId: userSubscriptions.userId,
      daysRemaining: userSubscriptions.daysRemaining,
      expirationDate: userSubscriptions.expirationDate,
      active: userSubscriptions.active,
      clientName: users.username,
      clientEmail: users.email,
      subscriptionName: subscriptions.name,
    })
    .from(userSubscriptions)
    .innerJoin(users, eq(userSubscriptions.userId, users.id))
    .leftJoin(subscriptions, eq(userSubscriptions.subscriptionId, subscriptions.id))
    .orderBy(desc(userSubscriptions.createdAt));

  const allSubscriptions = results.map((row) => ({
    subscriptionId: row.subscriptionId,
    userId: row.userId,
    clientName: row.clientName,
    clientEmail: row.clientEmail,
    subscriptionName: row.subscriptionName,
    daysRemaining: row.daysRemaining,
    expirationDate: row.expirationDate ? formatDate(new Date(row.expirationDate)) : null,
    active: row.active ?? false,
  }));

  return (
    <div className="space-y-6">
      <h1 className="font-headline text-headline-lg-mobile text-on-surface py-6">
        Gestión de Suscripciones
      </h1>
      <SubscriptionManagement subscriptions={allSubscriptions} />
    </div>
  );
}
