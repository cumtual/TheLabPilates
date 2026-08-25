import { desc, eq, notInArray } from 'drizzle-orm';
import { db } from '@/db';
import { openClasses, classEnrollments, users, userSubscriptions } from '@/db/schema';
import ClassManagement from '@/components/admin/ClassManagement';
import { autoCompletePassedClasses } from '@/lib/queries/class-auto-completion';

export default async function AdminClassesPage() {
  // Auto-complete past scheduled classes (lazy evaluation - secondary mechanism)
  await autoCompletePassedClasses();

  // Fetch ALL classes with coach name (no server pagination — client handles filters + pagination)
  const allClasses = await db
    .select({
      id: openClasses.id,
      classDate: openClasses.classDate,
      classType: openClasses.classType,
      status: openClasses.status,
      capacity: openClasses.capacity,
      coachUserId: openClasses.coachUserId,
      coachName: users.username,
    })
    .from(openClasses)
    .leftJoin(users, eq(openClasses.coachUserId, users.id))
    .orderBy(desc(openClasses.classDate));

  // Fetch all enrollments with student info (excluding cancelled)
  const allEnrollments = await db
    .select({
      classId: classEnrollments.openClassId,
      status: classEnrollments.status,
      studentName: users.username,
      studentEmail: users.email,
    })
    .from(classEnrollments)
    .innerJoin(userSubscriptions, eq(classEnrollments.userSubscriptionId, userSubscriptions.id))
    .innerJoin(users, eq(userSubscriptions.userId, users.id))
    .where(notInArray(classEnrollments.status, ['cancelled', 'late_cancelled']));

  // Group enrollments by class
  const enrollmentsByClass = new Map<string, { name: string; email: string; status: string | null }[]>();
  for (const e of allEnrollments) {
    if (!enrollmentsByClass.has(e.classId)) {
      enrollmentsByClass.set(e.classId, []);
    }
    enrollmentsByClass.get(e.classId)!.push({
      name: e.studentName,
      email: e.studentEmail,
      status: e.status,
    });
  }

  const classItems = allClasses.map((cls) => {
    const students = enrollmentsByClass.get(cls.id) ?? [];
    return {
      id: cls.id,
      classDate: cls.classDate?.toISOString() ?? null,
      classType: cls.classType,
      status: cls.status,
      capacity: cls.capacity,
      coachName: cls.coachName ?? 'Sin asignar',
      enrollmentCount: students.filter((s) => s.status === 'pending').length,
      enrolledStudents: students,
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between py-6">
        <h1 className="font-headline text-headline-lg-mobile text-on-surface">
          Gestión de Clases
        </h1>
        <a
          href="/admin/classes/new"
          className="inline-flex items-center justify-center px-4 py-2 min-h-11 font-body text-sm font-semibold uppercase tracking-wider bg-soft-charcoal text-on-primary rounded-DEFAULT transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lg"
        >
          + Nueva Clase
        </a>
      </div>
      <ClassManagement classes={classItems} />
    </div>
  );
}
