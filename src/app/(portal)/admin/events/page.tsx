import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { db } from '@/db';
import { getSpecialEventsHistory } from '@/lib/queries/events';
import { SpecialEventHistory } from '@/components/admin/SpecialEventHistory';
import { CreateSpecialEventForm } from '@/components/admin/CreateSpecialEventForm';

export default async function AdminEventsPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role !== 'admin') redirect('/login');

  const events = await getSpecialEventsHistory();

  const subscriptions = await db.query.subscriptions.findMany({
    orderBy: (table, { asc: ascFn }) => [ascFn(table.price)],
  });

  const hasActiveEvent = events.some((e) => e.status === 'active');

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-headline text-headline-lg-mobile text-on-surface py-6">
          Eventos Especiales
        </h1>

        {hasActiveEvent && (
          <div className="mb-4 p-4 rounded-lg bg-warm-wood/10 border border-warm-wood/30">
            <p className="font-body text-body-md text-secondary font-medium">
              Ya existe un evento activo. Finalízalo o cancélalo antes de crear otro.
            </p>
          </div>
        )}

        <SpecialEventHistory events={events} />
      </div>

      <div className="border-t border-outline-variant/40 pt-6">
        <h2 className="font-headline text-title-md text-on-surface mb-4">
          Crear Evento Especial
        </h2>
        <CreateSpecialEventForm
          subscriptions={subscriptions.map((s) => ({ id: s.id, name: s.name }))}
          disabled={hasActiveEvent}
        />
      </div>
    </div>
  );
}
