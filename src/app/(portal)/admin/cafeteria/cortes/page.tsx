import { ClosingList } from '@/components/cafeteria/ClosingList';
import { PendingClosingAlert } from '@/components/cafeteria/PendingClosingAlert';
import { loadClosings, loadPendingClosings } from '@/modules/cafeteria/presentation/queries';

export const dynamic = 'force-dynamic';

export default async function AdminClosingsPage() {
  const [pending, closings] = await Promise.all([loadPendingClosings(), loadClosings()]);
  return (
    <div className="space-y-4">
      <h1 className="font-headline text-headline-lg-mobile text-on-surface">Cortes de caja</h1>
      <PendingClosingAlert closings={pending} />
      <ClosingList closings={closings} />
    </div>
  );
}
