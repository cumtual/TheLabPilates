import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { users } from '@/db/schema';
import { getSession } from '@/lib/auth/session';
import { ProfileSettingsForm } from '@/components/profile/ProfileSettingsForm';

export default async function CoachProfilePage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const user = await db.query.users.findFirst({
    where: eq(users.id, session.sub),
  });

  if (!user) redirect('/login');

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="font-headline text-headline-lg-mobile text-on-surface py-6">
        Mi Perfil
      </h1>
      <ProfileSettingsForm initialName={user.username} />
    </div>
  );
}
