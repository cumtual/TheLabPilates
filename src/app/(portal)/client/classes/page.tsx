import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { db } from '@/db';
import { openClasses, classEnrollments, users } from '@/db/schema';
import { eq, count, and, gt } from 'drizzle-orm';
import { ClassList, type ClassItem } from '@/components/client/ClassList';
import { Pagination } from '@/components/ui/Pagination';

const PAGE_SIZE = 10;

export default async function ClientClassesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect('/login');

  const { page: pageParam } = await searchParams;
  const currentPage = Math.max(1, parseInt(pageParam ?? '1', 10));
  const offset = (currentPage - 1) * PAGE_SIZE;

  let classes: ClassItem[] = [];
  let totalPages = 1;
  let error = false;

  try {
    const now = new Date();

    // Get all scheduled future classes with enrollment counts (need to filter full ones)
    const allClasses = await db
      .select({
        id: openClasses.id,
        classDate: openClasses.classDate,
        classType: openClasses.classType,
        capacity: openClasses.capacity,
        coachUserId: openClasses.coachUserId,
        coachName: users.username,
        enrolledCount: count(classEnrollments.id),
      })
      .from(openClasses)
      .leftJoin(users, eq(openClasses.coachUserId, users.id))
      .leftJoin(classEnrollments, eq(openClasses.id, classEnrollments.openClassId))
      .where(
        and(
          eq(openClasses.status, 'scheduled'),
          gt(openClasses.classDate, now)
        )
      )
      .groupBy(openClasses.id, users.username)
      .orderBy(openClasses.classDate);

    // Filter out full classes
    const available = allClasses.filter((c) => c.enrolledCount < (c.capacity ?? 0));
    const total = available.length;
    totalPages = Math.ceil(total / PAGE_SIZE);

    // Paginate in-memory (post-filter pagination)
    const paginated = available.slice(offset, offset + PAGE_SIZE);

    classes = paginated.map((c) => ({
      id: c.id,
      classDate: c.classDate ?? new Date(),
      classType: c.classType,
      capacity: c.capacity,
      enrolledCount: c.enrolledCount,
      coachName: c.coachName,
    }));
  } catch {
    error = true;
  }

  return (
    <div className="space-y-6">
      <h1 className="font-headline text-headline-lg-mobile text-on-surface py-6">Clases Disponibles</h1>

      {error ? (
        <div className="bg-error/10 border border-error/30 rounded-lg p-4 text-center">
          <p className="font-body text-sm text-error">
            No se pudieron cargar las clases. Intenta de nuevo.
          </p>
          <a
            href="/client/classes"
            className="inline-flex items-center justify-center mt-3 px-4 py-2 min-h-11 font-body text-sm font-semibold uppercase tracking-wider bg-soft-charcoal text-on-primary rounded-DEFAULT transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-soft-charcoal"
          >
            Reintentar
          </a>
        </div>
      ) : (
        <>
          <ClassList classes={classes} />
          <Pagination currentPage={currentPage} totalPages={totalPages} />
        </>
      )}
    </div>
  );
}
