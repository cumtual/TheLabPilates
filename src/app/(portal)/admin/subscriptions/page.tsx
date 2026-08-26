import { redirect } from 'next/navigation';
import { desc, eq, count, ilike, or, and } from 'drizzle-orm';
import { getSession } from '@/lib/auth/session';
import { db } from '@/db';
import { userSubscriptions, users, subscriptions } from '@/db/schema';
import { SubscriptionManagement } from '@/components/admin/SubscriptionManagement';

const PAGE_SIZE = 10;

function formatDate(date: Date): string {
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

type StatusFilter = 'all' | 'active' | 'suspended' | 'expired';

const validStatuses: StatusFilter[] = ['all', 'active', 'suspended', 'expired'];

export default async function AdminSubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await getSession();
  if (!session || session.role !== 'admin') redirect('/login');

  const params = await searchParams;
  const currentPage = Math.max(1, Number(params.page) || 1);
  const rawFilter = typeof params.statusFilter === 'string' ? params.statusFilter : 'all';
  const currentFilter: StatusFilter = validStatuses.includes(rawFilter as StatusFilter)
    ? (rawFilter as StatusFilter)
    : 'all';
  const currentSearch = typeof params.search === 'string' ? params.search.trim() : '';

  // Build WHERE conditions
  const statusCondition =
    currentFilter !== 'all' ? eq(userSubscriptions.status, currentFilter) : undefined;

  const searchCondition =
    currentSearch !== ''
      ? or(
          ilike(users.username, `%${currentSearch}%`),
          ilike(users.email, `%${currentSearch}%`)
        )
      : undefined;

  // Combine conditions with AND
  const whereCondition =
    statusCondition && searchCondition
      ? and(statusCondition, searchCondition)
      : statusCondition ?? searchCondition;

  // Count query for pagination (with filter + search applied)
  const [{ total }] = await db
    .select({ total: count() })
    .from(userSubscriptions)
    .innerJoin(users, eq(userSubscriptions.userId, users.id))
    .where(whereCondition);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Main data query with LIMIT/OFFSET
  const results = await db
    .select({
      subscriptionId: userSubscriptions.id,
      userId: userSubscriptions.userId,
      daysRemaining: userSubscriptions.daysRemaining,
      expirationDate: userSubscriptions.expirationDate,
      active: userSubscriptions.active,
      status: userSubscriptions.status,
      clientName: users.username,
      clientEmail: users.email,
      subscriptionName: subscriptions.name,
      isOpenLab: subscriptions.guest,
    })
    .from(userSubscriptions)
    .innerJoin(users, eq(userSubscriptions.userId, users.id))
    .leftJoin(subscriptions, eq(userSubscriptions.subscriptionId, subscriptions.id))
    .where(whereCondition)
    .orderBy(desc(userSubscriptions.createdAt))
    .limit(PAGE_SIZE)
    .offset((currentPage - 1) * PAGE_SIZE);

  // Count queries per status for tab badges (also filtered by search)
  const statusCountResults = await db
    .select({
      status: userSubscriptions.status,
      count: count(),
    })
    .from(userSubscriptions)
    .innerJoin(users, eq(userSubscriptions.userId, users.id))
    .where(searchCondition)
    .groupBy(userSubscriptions.status);

  const statusCounts = {
    all: 0,
    active: 0,
    suspended: 0,
    expired: 0,
    pending: 0,
  };

  for (const row of statusCountResults) {
    const s = row.status;
    if (s && s in statusCounts) {
      statusCounts[s as keyof typeof statusCounts] = row.count;
    }
    statusCounts.all += row.count;
  }

  const allSubscriptions = results.map((row) => ({
    subscriptionId: row.subscriptionId,
    userId: row.userId,
    clientName: row.clientName,
    clientEmail: row.clientEmail,
    subscriptionName: row.subscriptionName,
    daysRemaining: row.daysRemaining,
    expirationDate: row.expirationDate ? formatDate(new Date(row.expirationDate)) : null,
    active: row.active ?? false,
    status: row.status,
    isOpenLab: row.isOpenLab ?? false,
  }));

  return (
    <div className="space-y-6">
      <h1 className="font-headline text-headline-lg-mobile text-on-surface py-6">
        Gestión de Suscripciones
      </h1>
      <SubscriptionManagement
        subscriptions={allSubscriptions}
        totalPages={totalPages}
        currentPage={currentPage}
        currentFilter={currentFilter}
        currentSearch={currentSearch}
        statusCounts={statusCounts}
      />
    </div>
  );
}
