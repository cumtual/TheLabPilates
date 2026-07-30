import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { CreateClassForm } from '@/components/coach/CreateClassForm';

export default async function NewClassPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  return (
    <div className="flex flex-col items-center py-6 px-4">
      <h1 className="font-headline text-headline-lg-mobile md:text-headline-lg text-on-surface mb-8">
        Nueva Clase
      </h1>
      <CreateClassForm />
    </div>
  );
}
