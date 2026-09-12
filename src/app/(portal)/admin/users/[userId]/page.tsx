import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/auth/session';
import { db } from '@/db';
import {
  users,
  userSubscriptions,
  payments,
  subscriptions,
  classEnrollments,
  openClasses,
} from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { ClientHistory } from '@/components/admin/ClientHistory';

function formatDate(date: Date): string {
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

async function getClientData(userId: string) {
  // Fetch user info
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!user) return null;

  // Fetch subscriptions with subscription package info, sorted by date descending
  const userSubs = await db
    .select({
      id: userSubscriptions.id,
      name: subscriptions.name,
      active: userSubscriptions.active,
      daysRemaining: userSubscriptions.daysRemaining,
      expirationDate: userSubscriptions.expirationDate,
      createdAt: userSubscriptions.createdAt,
    })
    .from(userSubscriptions)
    .leftJoin(subscriptions, eq(userSubscriptions.subscriptionId, subscriptions.id))
    .where(eq(userSubscriptions.userId, userId))
    .orderBy(desc(userSubscriptions.createdAt));

  // Fetch payments linked to this user's subscriptions, sorted by date descending
  const userPayments = await db
    .select({
      id: payments.id,
      paymentType: payments.paymentType,
      confirmed: payments.confirmed,
      amount: subscriptions.price,
      createdAt: payments.createdAt,
    })
    .from(payments)
    .innerJoin(userSubscriptions, eq(userSubscriptions.paymentId, payments.id))
    .leftJoin(subscriptions, eq(userSubscriptions.subscriptionId, subscriptions.id))
    .where(eq(userSubscriptions.userId, userId))
    .orderBy(desc(payments.createdAt));

  // Fetch attendance records (enrollments with class info), sorted by date descending
  const enrollmentRecords = await db
    .select({
      id: classEnrollments.id,
      classType: openClasses.classType,
      customName: openClasses.customName,
      classDate: openClasses.classDate,
      status: classEnrollments.status,
    })
    .from(classEnrollments)
    .innerJoin(openClasses, eq(classEnrollments.openClassId, openClasses.id))
    .innerJoin(
      userSubscriptions,
      eq(classEnrollments.userSubscriptionId, userSubscriptions.id)
    )
    .where(eq(userSubscriptions.userId, userId))
    .orderBy(desc(openClasses.classDate));

  // Compute metrics from enrollment statuses
  let totalAttended = 0;
  let totalAbsences = 0;
  let totalLateCancellations = 0;

  for (const record of enrollmentRecords) {
    if (record.status === 'attended') totalAttended++;
    else if (record.status === 'absent') totalAbsences++;
    else if (record.status === 'late_cancelled') totalLateCancellations++;
  }

  return {
    user: {
      username: user.username,
      email: user.email,
    },
    metrics: {
      totalAttended,
      totalAbsences,
      totalLateCancellations,
    },
    subscriptions: userSubs.map((sub) => ({
      id: sub.id,
      name: sub.name,
      active: sub.active ?? false,
      daysRemaining: sub.daysRemaining,
      expirationDate: sub.expirationDate
        ? formatDate(new Date(sub.expirationDate))
        : null,
      createdAt: sub.createdAt ? formatDate(new Date(sub.createdAt)) : '--/--/----',
    })),
    payments: userPayments.map((p) => ({
      id: p.id,
      paymentType: p.paymentType,
      confirmed: p.confirmed ?? false,
      amount: p.amount,
      createdAt: p.createdAt ? formatDate(new Date(p.createdAt)) : '--/--/----',
    })),
    attendance: enrollmentRecords.map((record) => ({
      id: record.id,
      classType: record.classType,
      customName: record.customName ?? null,
      classDate: record.classDate
        ? formatDate(new Date(record.classDate))
        : '--/--/----',
      status: record.status,
    })),
  };
}

export default async function ClientHistoryPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const session = await getSession();
  if (!session || session.role !== 'admin') redirect('/login');

  const { userId } = await params;

  let data: Awaited<ReturnType<typeof getClientData>> | null = null;
  let error: string | null = null;

  try {
    data = await getClientData(userId);
  } catch {
    error = 'No se pudo cargar el historial del cliente. Intenta de nuevo.';
  }

  if (!data && !error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link
            href="/admin/users"
            className="inline-flex items-center justify-center px-4 py-2 font-body text-sm font-medium text-primary border border-primary/30 rounded-lg transition-all duration-200 ease-out hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary min-h-11 min-w-11"
          >
            ← Volver
          </Link>
          <h1 className="font-headline text-headline-lg-mobile text-on-surface">
            Historial del Cliente
          </h1>
        </div>
        <div className="bg-surface rounded-lg shadow-sm border border-outline-variant/40 p-5">
          <p className="font-body text-sm text-outline text-center py-8">
            Cliente no encontrado.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 py-4">
      <div className="flex items-center gap-4">
        <Link
          href="/admin/users"
          className="inline-flex items-center justify-center px-4 py-2 font-body text-sm font-medium text-primary border border-primary/30 rounded-lg transition-all duration-200 ease-out hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary min-h-11 min-w-11"
        >
          ← Volver
        </Link>
        <h1 className="font-headline text-headline-lg-mobile text-on-surface">
          Historial del Cliente
        </h1>
      </div>

      <ClientHistory
        clientName={data?.user.username ?? ''}
        clientEmail={data?.user.email ?? ''}
        metrics={data?.metrics ?? { totalAttended: 0, totalAbsences: 0, totalLateCancellations: 0 }}
        subscriptions={data?.subscriptions ?? []}
        payments={data?.payments ?? []}
        attendance={data?.attendance ?? []}
        error={error}
      />
    </div>
  );
}
