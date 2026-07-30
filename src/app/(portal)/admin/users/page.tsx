import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { db } from '@/db';
import { users } from '@/db/schema';
import { desc, count, or, ilike, eq, and, isNull, type SQL } from 'drizzle-orm';
import { UserTable } from '@/components/admin/UserTable';
import { Pagination } from '@/components/ui/Pagination';
import { UserSearch } from '@/components/admin/UserSearch';
import { UserRoleFilter } from '@/components/admin/UserRoleFilter';
import type { UserRole } from '@/lib/types/roles';

const PAGE_SIZE = 10;

function formatDate(date: Date): string {
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; role?: string }>;
}) {
  const session = await getSession();
  if (!session || session.role !== 'admin') redirect('/login');

  const { page: pageParam, q: searchQuery, role: roleFilter } = await searchParams;
  const currentPage = Math.max(1, parseInt(pageParam ?? '1', 10));
  const offset = (currentPage - 1) * PAGE_SIZE;

  // Build conditions — always filter out deleted users
  const conditions: SQL[] = [isNull(users.deletedAt)];

  if (searchQuery) {
    const searchCond = or(
      ilike(users.username, `%${searchQuery}%`),
      ilike(users.email, `%${searchQuery}%`)
    );
    if (searchCond) conditions.push(searchCond);
  }

  if (roleFilter && ['client', 'coach', 'admin'].includes(roleFilter)) {
    conditions.push(eq(users.role, roleFilter as UserRole));
  }

  const whereCondition = and(...conditions);

  // Count totals by role (respecting search filter) for filter badges
  const searchCond = searchQuery
    ? or(ilike(users.username, `%${searchQuery}%`), ilike(users.email, `%${searchQuery}%`))
    : undefined;

  const roleCounts = { all: 0, client: 0, coach: 0, admin: 0 };

  const roleCountsConditions: SQL[] = [isNull(users.deletedAt)];
  if (searchCond) roleCountsConditions.push(searchCond);

  const roleCountsRaw = await db
    .select({ role: users.role, value: count() })
    .from(users)
    .where(and(...roleCountsConditions))
    .groupBy(users.role);

  for (const row of roleCountsRaw) {
    roleCounts[row.role as keyof typeof roleCounts] = row.value;
    roleCounts.all += row.value;
  }

  // Count total with all filters
  const [{ value: total }] = await db
    .select({ value: count() })
    .from(users)
    .where(whereCondition);
  const totalPages = Math.ceil(total / PAGE_SIZE);

  // Fetch paginated users
  const results = await db
    .select({
      id: users.id,
      username: users.username,
      email: users.email,
      role: users.role,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(whereCondition)
    .orderBy(desc(users.createdAt))
    .limit(PAGE_SIZE)
    .offset(offset);

  const allUsers = results.map((row) => ({
    id: row.id,
    username: row.username,
    email: row.email,
    role: row.role,
    createdAt: row.createdAt ? formatDate(new Date(row.createdAt)) : '--/--/----',
  }));

  return (
    <div className="space-y-6">
      <h1 className="font-headline text-headline-lg-mobile text-on-surface py-6">
        Gestión de Usuarios
      </h1>

      <UserSearch initialQuery={searchQuery ?? ''} />

      <UserRoleFilter currentRole={roleFilter ?? 'all'} counts={roleCounts} />

      <p className="font-body text-sm text-outline">
        {total} usuario{total !== 1 ? 's' : ''}
        {searchQuery && (
          <span className="text-primary font-medium"> para &quot;{searchQuery}&quot;</span>
        )}
      </p>

      <UserTable users={allUsers} />
      <Pagination currentPage={currentPage} totalPages={totalPages} />
    </div>
  );
}
