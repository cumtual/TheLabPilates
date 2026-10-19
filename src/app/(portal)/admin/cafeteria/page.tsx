import Link from 'next/link';
import { PendingClosingAlert } from '@/components/cafeteria/PendingClosingAlert';
import { formatPesos } from '@/modules/cafeteria/domain/money';
import { loadPendingClosings, loadTodaySummary } from '@/modules/cafeteria/presentation/queries';

export const dynamic = 'force-dynamic';

/** Resumen de hoy y aviso de cortes pendientes (SPEC-CAFETERIA §8.2). */
export default async function AdminCafeteriaPage() {
  const [summary, pending] = await Promise.all([loadTodaySummary(), loadPendingClosings()]);
  const cards = [
    ['Pedidos de hoy', String(summary.ordersCount)],
    ['Total', formatPesos(summary.totalCents)],
    ['Efectivo', formatPesos(summary.cashTotalCents)],
    ['Transferencias', formatPesos(summary.transferTotalCents)],
    ['Cortesías', `${summary.courtesyItems} (${formatPesos(summary.courtesyValueCents)})`],
    ['Anulados', String(summary.voidedCount)],
  ];
  return (
    <div className="space-y-5">
      <h1 className="font-headline text-headline-lg-mobile text-on-surface">Cafetería</h1>
      <PendingClosingAlert closings={pending} />
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {cards.map(([label, value]) => (
          <div key={label} className="rounded-lg bg-surface p-4 shadow-sm">
            <dt className="font-body text-xs text-on-surface-variant">{label}</dt>
            <dd className="font-body text-xl font-semibold text-on-surface">{value}</dd>
          </div>
        ))}
      </dl>
      <Link href="/admin/cafeteria/ventas" className="inline-flex min-h-11 items-center font-body text-sm text-primary underline underline-offset-2">
        Ver ventas y desglose
      </Link>
    </div>
  );
}
