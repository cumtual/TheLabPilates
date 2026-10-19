import { SalesDashboard } from '@/components/cafeteria/SalesDashboard';
import { getMexicoCityYmd } from '@/lib/utils/date';

export const dynamic = 'force-dynamic';

/** Ventas por fecha, método y producto (SPEC-CAFETERIA A5, §8.2). Se consultan bajo demanda. */
export default function AdminSalesPage() {
  return (
    <div className="space-y-4">
      <h1 className="font-headline text-headline-lg-mobile text-on-surface">Ventas</h1>
      <SalesDashboard today={getMexicoCityYmd(new Date())} />
    </div>
  );
}
