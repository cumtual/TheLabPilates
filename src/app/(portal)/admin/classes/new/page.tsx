import { redirect } from 'next/navigation';
import { isNull } from 'drizzle-orm';
import { getSession } from '@/lib/auth/session';
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq, and, or } from 'drizzle-orm';
import { AdminCreateClassForm } from '@/components/admin/AdminCreateClassForm';

export default async function AdminNewClassPage() {
  const session = await getSession();
  if (!session || session.role !== 'admin') redirect('/login');

  // Fetch all coaches (and admins) for the dropdown
  const coaches = await db
    .select({ id: users.id, username: users.username, email: users.email })
    .from(users)
    .where(
      and(
        or(eq(users.role, 'coach'), eq(users.role, 'admin')),
        isNull(users.deletedAt)
      )
    );

  return (
    <div className="space-y-6">
      <h1 className="font-headline text-headline-lg-mobile text-on-surface">
        Crear Clase
      </h1>
      <AdminCreateClassForm coaches={coaches} />
    </div>
  );
}
