import { summarizeShift } from '../../domain/closing';
import { invalid } from '../../domain/errors';
import { sumCents, type Cents } from '../../domain/money';
import { courtesyValue, type PaymentMethod } from '../../domain/order';
import { breakdownByProduct, type BreakdownRow } from '../../domain/sales';
import type { Actor, CafeteriaDeps, OrderItemRow, OrderRow } from '../ports';
import { ADMIN_ONLY, requireRole } from '../shared';

/**
 * Ventas del admin (SPEC-CAFETERIA §8.2, A5): se consultan bajo demanda, por días CDMX.
 * Los anulados salen de los totales pero se pueden listar.
 */

export type SalesMethodFilter = PaymentMethod | 'courtesy';
export type SalesStatusFilter = 'all' | 'paid' | 'voided';

export interface SalesReportInput {
  from: string;
  to: string;
  method?: SalesMethodFilter | null;
  status?: SalesStatusFilter;
  q?: string;
  page?: number;
}

export const SALES_PAGE_SIZE = 25;
export const SALES_MAX_DAYS = 366;

export interface SalesOrderView {
  id: string;
  folio: number;
  createdAt: Date;
  status: 'paid' | 'voided';
  customerLabel: string | null;
  paymentMethod: PaymentMethod | null;
  totalCents: Cents;
  discountCents: Cents;
  discountLabel: string | null;
  closed: boolean;
  voidReason: string | null;
  lines: {
    productName: string;
    group: string;
    quantity: number;
    lineTotalCents: Cents;
    isCourtesy: boolean;
    courtesySource: 'monthly' | 'grant' | null;
  }[];
}

export interface SalesReport {
  range: { from: string; to: string };
  totals: {
    ordersCount: number;
    cashTotalCents: Cents;
    transferTotalCents: Cents;
    totalCents: Cents;
    courtesyItems: number;
    courtesyMonthly: number;
    courtesyGrant: number;
    courtesyValueCents: Cents;
    /** Descuentos por membresía (D13); `totalCents` ya los descuenta. */
    discountCents: Cents;
    voidedCount: number;
  };
  breakdown: BreakdownRow[];
  orders: SalesOrderView[];
  totalOrders: number;
  page: number;
  pageCount: number;
  generatedAt: Date;
}

function daysBetween(from: string, to: string): number {
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
}

export async function getSalesReport(deps: CafeteriaDeps, actor: Actor | null, input: SalesReportInput): Promise<SalesReport> {
  requireRole(actor, ADMIN_ONLY);
  const { clock } = deps;
  if (!clock.isValidYmd(input.from)) throw invalid('Fecha inicial no válida.', 'from');
  if (!clock.isValidYmd(input.to)) throw invalid('Fecha final no válida.', 'to');
  if (input.to < input.from) throw invalid('La fecha final es anterior a la inicial.', 'to');
  if (daysBetween(input.from, input.to) >= SALES_MAX_DAYS) throw invalid(`Máximo ${SALES_MAX_DAYS} días por consulta.`, 'to');
  const { start, end } = clock.dayRange(input.from, input.to);

  return deps.uow.read(async (tx) => {
    const orders = await tx.orders.listCreatedBetween({ from: start, to: end });
    const items = await tx.orders.itemsOf(orders.map((o) => o.id));
    const customers = await tx.users.findMany([...new Set(orders.map((o) => o.customerUserId).filter((id): id is string => id !== null))]);
    const byOrder = new Map<string, OrderItemRow[]>();
    for (const item of items) byOrder.set(item.orderId, [...(byOrder.get(item.orderId) ?? []), item]);
    const customerOf = (o: OrderRow) => customers.find((c) => c.id === o.customerUserId);

    const q = input.q?.trim().toLowerCase() ?? '';
    const folioQuery = /^#?\d+$/.test(q) ? Number(q.replace('#', '')) : null;
    const matches = (o: OrderRow) => {
      const lines = byOrder.get(o.id) ?? [];
      if (input.method === 'courtesy' && !lines.some((l) => l.isCourtesy)) return false;
      if ((input.method === 'cash' || input.method === 'transfer') && o.paymentMethod !== input.method) return false;
      if (input.status && input.status !== 'all' && o.status !== input.status) return false;
      if (q === '') return true;
      if (folioQuery !== null && o.folio === folioQuery) return true;
      const customer = customerOf(o);
      return (
        (o.customerName ?? '').toLowerCase().includes(q) ||
        (customer?.name ?? '').toLowerCase().includes(q) ||
        (customer?.email ?? '').toLowerCase().includes(q) ||
        lines.some((l) => l.productName.toLowerCase().includes(q))
      );
    };

    const filtered = orders.filter(matches);
    const paid = filtered.filter((o) => o.status === 'paid');
    const paidLines = paid.flatMap((o) => byOrder.get(o.id) ?? []);
    const shift = summarizeShift(
      paid.map((o) => ({
        status: o.status,
        totalCents: o.totalCents,
        paymentMethod: o.paymentMethod,
        courtesyItems: (byOrder.get(o.id) ?? []).filter((l) => l.isCourtesy).length,
        courtesyValueCents: courtesyValue(byOrder.get(o.id) ?? []),
        createdAt: o.createdAt,
      }))
    );

    const pageCount = Math.max(1, Math.ceil(filtered.length / SALES_PAGE_SIZE));
    const page = Math.min(Math.max(1, Math.floor(input.page ?? 1)), pageCount);

    return {
      range: { from: input.from, to: input.to },
      totals: {
        ordersCount: shift.ordersCount,
        cashTotalCents: shift.cashTotalCents,
        transferTotalCents: shift.transferTotalCents,
        totalCents: sumCents(paid.map((o) => o.totalCents)),
        courtesyItems: shift.courtesyItemsCount,
        courtesyMonthly: paidLines.filter((l) => l.isCourtesy && l.courtesySource === 'monthly').length,
        courtesyGrant: paidLines.filter((l) => l.isCourtesy && l.courtesySource === 'grant').length,
        courtesyValueCents: shift.courtesyValueCents,
        discountCents: sumCents(paid.map((o) => o.discountCents)),
        voidedCount: filtered.length - paid.length,
      },
      breakdown: breakdownByProduct(paidLines),
      orders: filtered.slice((page - 1) * SALES_PAGE_SIZE, page * SALES_PAGE_SIZE).map((o) => ({
        id: o.id,
        folio: o.folio,
        createdAt: o.createdAt,
        status: o.status,
        customerLabel: o.customerName ?? customerOf(o)?.name ?? null,
        paymentMethod: o.paymentMethod,
        totalCents: o.totalCents,
        discountCents: o.discountCents,
        discountLabel: o.discountLabel,
        closed: o.closingId !== null,
        voidReason: o.voidReason,
        lines: (byOrder.get(o.id) ?? []).map((l) => ({
          productName: l.productName,
          group: l.parentCategoryName ? `${l.parentCategoryName} › ${l.categoryName}` : l.categoryName,
          quantity: l.quantity,
          lineTotalCents: l.lineTotalCents,
          isCourtesy: l.isCourtesy,
          courtesySource: l.courtesySource,
        })),
      })),
      totalOrders: filtered.length,
      page,
      pageCount,
      generatedAt: clock.now(),
    };
  });
}

/** Resumen de hoy (CDMX) para `/admin/cafeteria`. */
export async function getTodaySummary(deps: CafeteriaDeps, actor: Actor | null): Promise<SalesReport['totals']> {
  const today = deps.clock.ymd(deps.clock.now());
  return (await getSalesReport(deps, actor, { from: today, to: today, status: 'all' })).totals;
}
