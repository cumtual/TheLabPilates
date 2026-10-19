import { resolveClosing as resolveDomain, summarizeShift, validateDelivery, type ShiftTotals } from '../../domain/closing';
import { CafeteriaError, invalid } from '../../domain/errors';
import type { Cents } from '../../domain/money';
import { courtesyValue, type PaymentMethod } from '../../domain/order';
import { breakdownByProduct, type BreakdownRow } from '../../domain/sales';
import type {
  Actor,
  CafeteriaDeps,
  CafeteriaTx,
  ClosingEmailData,
  ClosingRow,
  OrderItemRow,
  OrderRow,
} from '../ports';
import { ADMIN_ONLY, BAR_ROLES, requireRole } from '../shared';

/** Corte de caja (SPEC-CAFETERIA D6, A2–A4, A8, §4.4, §5, §6). */

function shiftOrders(orders: readonly OrderRow[], items: readonly OrderItemRow[]) {
  return orders.map((order) => {
    const lines = items.filter((i) => i.orderId === order.id);
    return {
      status: order.status,
      totalCents: order.totalCents,
      paymentMethod: order.paymentMethod,
      courtesyItems: lines.filter((l) => l.isCourtesy).length,
      courtesyValueCents: courtesyValue(lines),
      createdAt: order.createdAt,
    };
  });
}

// ── Turno abierto ────────────────────────────────────────────────────────────

export interface OpenOrderView {
  id: string;
  folio: number;
  createdAt: Date;
  customerLabel: string | null;
  paymentMethod: PaymentMethod | null;
  totalCents: Cents;
  courtesyItems: number;
  itemsLabel: string;
}

export interface OpenShift {
  orders: OpenOrderView[];
  totals: ShiftTotals;
  pendingClosings: number;
}

function itemsLabel(lines: readonly OrderItemRow[]): string {
  return lines.map((l) => (l.quantity > 1 ? `${l.quantity}× ${l.productName}` : l.productName)).join(', ');
}

/** A8: la barra ve solo los pedidos sin corte, no el historial. */
export async function getOpenShift(deps: CafeteriaDeps, actor: Actor | null): Promise<OpenShift> {
  requireRole(actor, BAR_ROLES);
  return deps.uow.read(async (tx) => {
    const orders = await tx.orders.listOpen({ forUpdate: false });
    const [items, pending, users] = await Promise.all([
      tx.orders.itemsOf(orders.map((o) => o.id)),
      tx.closings.listPending(),
      tx.users.findMany([...new Set(orders.map((o) => o.customerUserId).filter((id): id is string => id !== null))]),
    ]);
    const names = new Map(users.map((u) => [u.id, u.name]));
    return {
      orders: orders.map((order) => {
        const lines = items.filter((i) => i.orderId === order.id);
        return {
          id: order.id,
          folio: order.folio,
          createdAt: order.createdAt,
          customerLabel: order.customerName ?? (order.customerUserId ? names.get(order.customerUserId) ?? null : null),
          paymentMethod: order.paymentMethod,
          totalCents: order.totalCents,
          courtesyItems: lines.filter((l) => l.isCourtesy).length,
          itemsLabel: itemsLabel(lines),
        };
      }),
      totals: summarizeShift(shiftOrders(orders, items)),
      pendingClosings: pending.length,
    };
  });
}

// ── Correos ──────────────────────────────────────────────────────────────────

async function emailData(tx: CafeteriaTx, closing: ClosingRow): Promise<ClosingEmailData> {
  const [orders, settings, people] = await Promise.all([
    tx.orders.listByClosing(closing.id),
    tx.settings.get(),
    tx.users.findMany([closing.createdBy, ...(closing.resolvedBy ? [closing.resolvedBy] : [])]),
  ]);
  const items = await tx.orders.itemsOf(orders.map((o) => o.id));
  const nameOf = (id: string | null) => (id ? people.find((p) => p.id === id)?.name ?? 'Usuario' : null);
  return {
    closing,
    createdByName: nameOf(closing.createdBy)!,
    resolvedByName: nameOf(closing.resolvedBy),
    items,
    transfers: orders
      .filter((o) => o.paymentMethod === 'transfer')
      .sort((a, b) => a.folio - b.folio)
      .map((o) => ({ folio: o.folio, totalCents: o.totalCents, createdAt: o.createdAt })),
    discountCents: orders.reduce((sum, o) => sum + o.discountCents, 0),
    recipients: settings.closingNotifyEmails,
  };
}

/** Envía después de guardar y espera el resultado; un fallo nunca revierte el corte (§6). */
async function notify(deps: CafeteriaDeps, closingId: string, which: 'created' | 'resolved'): Promise<boolean> {
  let sent = false;
  try {
    const data = await deps.uow.read(async (tx) => {
      const closing = await tx.closings.findById(closingId);
      return closing ? emailData(tx, closing) : null;
    });
    if (data) sent = which === 'created' ? await deps.notifier.closingCreated(data) : await deps.notifier.closingResolved(data);
  } catch {
    sent = false;
  }
  try {
    await deps.uow.run((tx) => tx.closings.setEmailStatus(closingId, which, sent ? 'sent' : 'failed', sent ? deps.clock.now() : null));
  } catch {
    // El corte ya está guardado; el admin verá el estado «pendiente» y podrá reintentar.
  }
  return sent;
}

// ── Crear (barra) ────────────────────────────────────────────────────────────

export interface CreateClosingInput {
  cashDeliveredCents: Cents;
  deliveryNote?: string | null;
  /** Lo que la barra vio en pantalla; si cambió, se rechaza (§5). */
  expectedOrdersCount: number;
  expectedCashTotalCents: Cents;
}

export async function createClosing(
  deps: CafeteriaDeps,
  actor: Actor | null,
  input: CreateClosingInput
): Promise<{ closing: ClosingRow; emailSent: boolean }> {
  const cashier = requireRole(actor, BAR_ROLES);

  const closing = await deps.uow.run(async (tx) => {
    // Bloquea las filas: dos cortes simultáneos no pueden tomar los mismos pedidos.
    const orders = await tx.orders.listOpen({ forUpdate: true });
    if (orders.length === 0) throw new CafeteriaError('NO_OPEN_ORDERS', 'No hay pedidos pagados pendientes de corte.');
    const items = await tx.orders.itemsOf(orders.map((o) => o.id));
    const totals = summarizeShift(shiftOrders(orders, items));
    if (totals.ordersCount !== input.expectedOrdersCount || totals.cashTotalCents !== input.expectedCashTotalCents) {
      throw new CafeteriaError('SHIFT_CHANGED', 'Cambió el turno, revisa los totales.');
    }
    const deliveryNote = validateDelivery({
      cashTotalCents: totals.cashTotalCents,
      cashDeliveredCents: input.cashDeliveredCents,
      note: input.deliveryNote,
    });
    const created = await tx.closings.insert({
      createdBy: cashier.id,
      periodStart: totals.periodStart!,
      periodEnd: totals.periodEnd!,
      ordersCount: totals.ordersCount,
      cashOrdersCount: totals.cashOrdersCount,
      transferOrdersCount: totals.transferOrdersCount,
      courtesyItemsCount: totals.courtesyItemsCount,
      courtesyValueCents: totals.courtesyValueCents,
      cashTotalCents: totals.cashTotalCents,
      transferTotalCents: totals.transferTotalCents,
      cashDeliveredCents: input.cashDeliveredCents,
      deliveryNote,
      createdAt: deps.clock.now(),
    });
    await tx.orders.markClosed(
      orders.map((o) => o.id),
      created.id
    );
    return created;
  });

  const emailSent = await notify(deps, closing.id, 'created');
  return { closing, emailSent };
}

// ── Resolver (admin) ─────────────────────────────────────────────────────────

export type ResolveClosingInput =
  | { closingId: string; outcome: 'received_all' }
  | { closingId: string; outcome: 'received_partial'; cashReceivedCents: Cents; note: string };

export async function resolveClosing(
  deps: CafeteriaDeps,
  actor: Actor | null,
  input: ResolveClosingInput
): Promise<{ closing: ClosingRow; emailSent: boolean }> {
  const admin = requireRole(actor, ADMIN_ONLY);

  await deps.uow.run(async (tx) => {
    const closing = await tx.closings.findById(input.closingId);
    if (!closing) throw new CafeteriaError('NOT_FOUND', 'El corte no existe.');
    const resolution = resolveDomain(
      closing,
      input.outcome === 'received_all'
        ? { outcome: 'received_all' }
        : { outcome: 'received_partial', cashReceivedCents: input.cashReceivedCents, note: input.note }
    );
    const done = await tx.closings.resolve(closing.id, { ...resolution, resolvedBy: admin.id, resolvedAt: deps.clock.now() });
    if (!done) throw new CafeteriaError('ALREADY_RESOLVED', 'Este corte ya fue resuelto.');
  });

  const emailSent = await notify(deps, input.closingId, 'resolved');
  const closing = await deps.uow.read((tx) => tx.closings.findById(input.closingId));
  return { closing: closing!, emailSent };
}

// ── Reintentar correo (admin) ────────────────────────────────────────────────

export async function retryClosingEmail(
  deps: CafeteriaDeps,
  actor: Actor | null,
  input: { closingId: string; which: 'created' | 'resolved' }
): Promise<{ emailSent: boolean }> {
  requireRole(actor, ADMIN_ONLY);
  const closing = await deps.uow.read((tx) => tx.closings.findById(input.closingId));
  if (!closing) throw new CafeteriaError('NOT_FOUND', 'El corte no existe.');
  if (input.which === 'resolved' && closing.status === 'pending') throw invalid('El corte aún no se resuelve.');
  return { emailSent: await notify(deps, closing.id, input.which) };
}

// ── Consultas del admin ──────────────────────────────────────────────────────

export interface ClosingView extends ClosingRow {
  createdByName: string;
  resolvedByName: string | null;
}

export interface ClosingDetail extends ClosingView {
  breakdown: BreakdownRow[];
  transfers: ClosingEmailData['transfers'];
  discountCents: Cents;
}

async function withNames(tx: CafeteriaTx, closings: readonly ClosingRow[]): Promise<ClosingView[]> {
  const ids = [...new Set(closings.flatMap((c) => [c.createdBy, ...(c.resolvedBy ? [c.resolvedBy] : [])]))];
  const people = await tx.users.findMany(ids);
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? 'Usuario';
  return closings.map((c) => ({ ...c, createdByName: nameOf(c.createdBy), resolvedByName: c.resolvedBy ? nameOf(c.resolvedBy) : null }));
}

async function detailOf(tx: CafeteriaTx, closing: ClosingRow): Promise<ClosingDetail> {
  const [view] = await withNames(tx, [closing]);
  const data = await emailData(tx, closing);
  return { ...view, breakdown: breakdownByProduct(data.items), transfers: data.transfers, discountCents: data.discountCents };
}

export async function listClosings(deps: CafeteriaDeps, actor: Actor | null, limit = 50): Promise<ClosingView[]> {
  requireRole(actor, ADMIN_ONLY);
  return deps.uow.read(async (tx) => withNames(tx, await tx.closings.listRecent(limit)));
}

/** Cortes pendientes con su detalle: alimentan «Tienes un corte de caja pendiente». */
export async function getPendingClosings(deps: CafeteriaDeps, actor: Actor | null): Promise<ClosingDetail[]> {
  requireRole(actor, ADMIN_ONLY);
  return deps.uow.read(async (tx) => {
    const pending = await tx.closings.listPending();
    return Promise.all(pending.map((c) => detailOf(tx, c)));
  });
}

export async function getClosingDetail(deps: CafeteriaDeps, actor: Actor | null, closingId: string): Promise<ClosingDetail> {
  requireRole(actor, ADMIN_ONLY);
  return deps.uow.read(async (tx) => {
    const closing = await tx.closings.findById(closingId);
    if (!closing) throw new CafeteriaError('NOT_FOUND', 'El corte no existe.');
    return detailOf(tx, closing);
  });
}
