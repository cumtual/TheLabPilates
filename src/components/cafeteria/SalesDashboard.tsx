'use client';

import { useEffect, useState, useTransition } from 'react';
import { Modal } from '@/components/ui/Modal';
import { formatAuditDateTime, formatTimeWithMeridiem } from '@/lib/utils/date';
import { TEMPERATURE_LABELS } from '@/modules/cafeteria/domain/category-tree';
import { formatPesos } from '@/modules/cafeteria/domain/money';
import { PAYMENT_METHOD_LABELS } from '@/modules/cafeteria/domain/order';
import { getSalesReportAction, voidOrderAction } from '@/modules/cafeteria/presentation/actions/admin';
import type { SalesMethodFilter, SalesOrderView, SalesReport, SalesStatusFilter } from '@/modules/cafeteria/presentation/types';

interface Filters {
  from: string;
  to: string;
  method: SalesMethodFilter | '';
  status: SalesStatusFilter;
  q: string;
  page: number;
}

/**
 * Ventas del admin (SPEC-CAFETERIA A5, §8.2). Se consultan **solo** al abrir, al cambiar
 * un filtro, al buscar, al cambiar de página o con «Actualizar». Sin intervalos.
 */
export function SalesDashboard({ today }: { today: string }) {
  const [filters, setFilters] = useState<Filters>({ from: today, to: today, method: '', status: 'all', q: '', page: 1 });
  const [search, setSearch] = useState('');
  const [report, setReport] = useState<SalesReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Cada consulta pedida (filtros o «Actualizar») sube el número; carga mientras no llegue su respuesta. */
  const [requested, setRequested] = useState(0);
  const [answered, setAnswered] = useState(-1);
  const loading = answered !== requested;
  const [toVoid, setToVoid] = useState<SalesOrderView | null>(null);
  const [reason, setReason] = useState('');
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [isVoiding, startVoid] = useTransition();

  useEffect(() => {
    let stale = false;
    void getSalesReportAction({
      from: filters.from,
      to: filters.to,
      method: filters.method || null,
      status: filters.status,
      q: filters.q || undefined,
      page: filters.page,
    }).then((result) => {
      if (stale) return;
      setAnswered(requested);
      if (result.success) {
        setReport(result.data);
        setError(null);
      } else {
        setError(result.error);
      }
    });
    // Una respuesta vieja (filtros ya cambiados) se descarta.
    return () => {
      stale = true;
    };
  }, [filters, requested]);

  const refresh = () => setRequested((n) => n + 1);
  const change = (patch: Partial<Filters>) => {
    setFilters((prev) => ({ ...prev, page: 1, ...patch }));
    refresh();
  };
  const goToPage = (page: number) => {
    setFilters((prev) => ({ ...prev, page }));
    refresh();
  };

  function confirmVoid() {
    const order = toVoid;
    if (!order || reason.trim() === '') return;
    setToVoid(null);
    startVoid(async () => {
      const result = await voidOrderAction({ orderId: order.id, reason: reason.trim() });
      setReason('');
      setNotice(result.success ? { ok: true, text: `Pedido #${order.folio} anulado.` } : { ok: false, text: result.error });
      if (result.success) refresh();
    });
  }

  const totals = report?.totals;
  const field = 'min-h-11 px-3 rounded-lg border border-outline-variant bg-surface font-body text-sm';

  return (
    <div className="space-y-5">
      <div className="rounded-lg bg-surface p-4 shadow-sm space-y-3">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <label className="font-body text-xs text-on-surface-variant">
            Desde
            <input aria-label="Desde" type="date" value={filters.from} max={filters.to} onChange={(e) => e.target.value && change({ from: e.target.value })} className={`mt-1 w-full ${field}`} />
          </label>
          <label className="font-body text-xs text-on-surface-variant">
            Hasta
            <input aria-label="Hasta" type="date" value={filters.to} min={filters.from} onChange={(e) => e.target.value && change({ to: e.target.value })} className={`mt-1 w-full ${field}`} />
          </label>
          <label className="font-body text-xs text-on-surface-variant">
            Método
            <select aria-label="Método" value={filters.method} onChange={(e) => change({ method: e.target.value as Filters['method'] })} className={`mt-1 w-full ${field}`}>
              <option value="">Todos</option>
              <option value="cash">Efectivo</option>
              <option value="transfer">Transferencia</option>
              <option value="courtesy">Con cortesía</option>
            </select>
          </label>
          <label className="font-body text-xs text-on-surface-variant">
            Estado
            <select aria-label="Estado" value={filters.status} onChange={(e) => change({ status: e.target.value as SalesStatusFilter })} className={`mt-1 w-full ${field}`}>
              <option value="all">Todos</option>
              <option value="paid">Pagados</option>
              <option value="voided">Anulados</option>
            </select>
          </label>
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            change({ q: search.trim() });
          }}
        >
          <input aria-label="Buscar folio, cliente o producto" placeholder="#folio, cliente o producto" value={search} onChange={(e) => setSearch(e.target.value)} className={`flex-1 ${field}`} />
          <button type="submit" className="min-h-11 px-4 rounded-DEFAULT border border-outline-variant font-body text-sm">
            Buscar
          </button>
        </form>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" disabled={loading} onClick={refresh} className="min-h-11 px-4 rounded-DEFAULT bg-soft-charcoal font-body text-sm font-semibold text-on-primary disabled:opacity-50">
            {loading ? 'Consultando…' : 'Actualizar'}
          </button>
          {report && <span className="font-body text-xs text-on-surface-variant">Última consulta: {formatTimeWithMeridiem(report.generatedAt)}</span>}
        </div>
      </div>

      {error && <p role="alert" className="font-body text-sm text-error">{error}</p>}
      {notice && (
        <p role="status" className={`font-body text-sm ${notice.ok ? 'text-primary' : 'text-error'}`}>
          {notice.text}
        </p>
      )}

      {totals && (
        <dl className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Totales">
          {[
            ['Total vendido', formatPesos(totals.totalCents)],
            ['Efectivo', formatPesos(totals.cashTotalCents)],
            ['Transferencias', formatPesos(totals.transferTotalCents)],
            ['Pedidos', String(totals.ordersCount)],
            ['Cortesías (cupo mensual)', String(totals.courtesyMonthly)],
            ['Cortesías (regalos)', String(totals.courtesyGrant)],
            ['Valor de cortesías', formatPesos(totals.courtesyValueCents)],
            ['Descuentos a miembros', formatPesos(totals.discountCents)],
            ['Anulados', String(totals.voidedCount)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg bg-surface p-3 shadow-sm">
              <dt className="font-body text-xs text-on-surface-variant">{label}</dt>
              <dd className="font-body text-lg font-semibold text-on-surface">{value}</dd>
            </div>
          ))}
        </dl>
      )}

      {report && report.breakdown.length > 0 && (
        <section aria-label="Desglose por producto" className="rounded-lg bg-surface p-4 shadow-sm overflow-x-auto">
          <h2 className="font-headline text-lg text-on-surface mb-2">Desglose por producto</h2>
          <table className="w-full min-w-[32rem] font-body text-sm">
            <thead>
              <tr className="text-left text-xs text-on-surface-variant">
                <th className="py-1">Categoría</th>
                <th>Producto</th>
                <th className="text-right">Vendidos</th>
                <th className="text-right">Ingreso</th>
                <th className="text-right">Cortesías</th>
              </tr>
            </thead>
            <tbody>
              {report.breakdown.map((r) => (
                <tr key={`${r.group}-${r.productName}-${r.temperature}`} className="border-t border-outline-variant/30">
                  <td className="py-1">{r.group}</td>
                  <td>{r.temperature ? `${r.productName} (${TEMPERATURE_LABELS[r.temperature]})` : r.productName}</td>
                  <td className="text-right">{r.soldQuantity}</td>
                  <td className="text-right">{formatPesos(r.revenueCents)}</td>
                  <td className="text-right">
                    {r.courtesyMonthly + r.courtesyGrant}
                    {r.courtesyGrant > 0 && r.courtesyMonthly > 0 ? ` (${r.courtesyMonthly} cupo · ${r.courtesyGrant} regalo)` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {report && (
        <section aria-label="Pedidos" className="space-y-2">
          <h2 className="font-headline text-lg text-on-surface">Pedidos ({report.totalOrders})</h2>
          {report.orders.length === 0 && <p className="font-body text-sm text-on-surface-variant">Sin pedidos en este rango.</p>}
          <ul className="space-y-2">
            {report.orders.map((o) => (
              <li key={o.id} data-testid={`order-${o.folio}`} className={`rounded-lg bg-surface p-3 shadow-sm space-y-1 ${o.status === 'voided' ? 'opacity-60' : ''}`}>
                <div className="flex flex-wrap items-center gap-2 font-body text-sm">
                  <span className="font-semibold">#{o.folio}</span>
                  <span className="text-outline">{formatAuditDateTime(o.createdAt)}</span>
                  {o.customerLabel && <span>{o.customerLabel}</span>}
                  <span className="text-xs text-on-surface-variant">{o.paymentMethod ? PAYMENT_METHOD_LABELS[o.paymentMethod] : 'Cortesía'}</span>
                  {o.discountCents > 0 && (
                    <span className="text-xs text-primary">
                      Descuento {o.discountLabel}: −{formatPesos(o.discountCents)}
                    </span>
                  )}
                  {o.status === 'voided' && <span className="text-xs font-semibold text-error">Anulado: {o.voidReason}</span>}
                  {o.closed && <span className="text-xs text-outline">En corte</span>}
                  <span className="ml-auto font-semibold">{formatPesos(o.totalCents)}</span>
                </div>
                <ul className="font-body text-xs text-on-surface-variant">
                  {o.lines.map((l, i) => (
                    <li key={i}>
                      {l.quantity}× {l.productName}
                      {l.isCourtesy ? ` — cortesía (${l.courtesySource === 'grant' ? 'regalo' : 'cupo mensual'})` : ` — ${formatPesos(l.lineTotalCents)}`}
                    </li>
                  ))}
                </ul>
                {o.status === 'paid' && !o.closed && (
                  <button type="button" onClick={() => setToVoid(o)} className="min-h-11 px-2 font-body text-sm text-error">
                    Anular
                  </button>
                )}
              </li>
            ))}
          </ul>
          {report.pageCount > 1 && (
            <div className="flex items-center justify-center gap-3">
              <button type="button" disabled={report.page <= 1} onClick={() => goToPage(report.page - 1)} className="min-h-11 px-3 rounded border border-outline-variant disabled:opacity-40">
                Anterior
              </button>
              <span className="font-body text-sm">
                {report.page} / {report.pageCount}
              </span>
              <button type="button" disabled={report.page >= report.pageCount} onClick={() => goToPage(report.page + 1)} className="min-h-11 px-3 rounded border border-outline-variant disabled:opacity-40">
                Siguiente
              </button>
            </div>
          )}
        </section>
      )}

      <Modal
        isOpen={toVoid !== null}
        onClose={() => {
          setToVoid(null);
          setReason('');
        }}
        onConfirm={confirmVoid}
        title={`Anular pedido #${toVoid?.folio ?? ''}`}
        confirmLabel="Sí, anular"
        variant="danger"
        confirmDisabled={reason.trim() === '' || isVoiding}
      >
        <p className="text-sm">
          Total: <strong>{formatPesos(toVoid?.totalCents ?? 0)}</strong>. Sale de los totales y las cortesías vuelven a su saldo.
        </p>
        <label htmlFor="void-reason" className="mt-3 block text-sm font-semibold text-on-surface">
          Motivo (obligatorio)
        </label>
        <textarea id="void-reason" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 w-full min-h-16 px-3 py-2 rounded-lg border border-outline-variant bg-surface text-sm" />
      </Modal>
    </div>
  );
}
