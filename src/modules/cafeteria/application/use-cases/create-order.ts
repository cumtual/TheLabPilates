import { allocateCourtesies } from '../../domain/courtesy-grants';
import { CafeteriaError, invalid } from '../../domain/errors';
import type { Cents } from '../../domain/money';
import {
  buildOrderLines,
  CUSTOMER_NAME_MAX,
  discountCents,
  orderTotal,
  resolvePaymentMethod,
  type OrderLineInput,
  type PaymentMethod,
} from '../../domain/order';
import type { Actor, CafeteriaDeps, NewOrderItem, UserSummary } from '../ports';
import { BAR_ROLES, loadCustomerCourtesy, loadMenuSnapshot, requireRole, toSellableProducts } from '../shared';

/** Cobro en la barra (SPEC-CAFETERIA §4.3, §5). Una transacción; idempotente por `requestId`. */

export type OrderCustomerInput = { type: 'none' } | { type: 'name'; name: string } | { type: 'user'; userId: string };

export interface CreateOrderInput {
  requestId: string;
  customer: OrderCustomerInput;
  items: OrderLineInput[];
  paymentMethod: PaymentMethod | null;
}

export interface CreateOrderResult {
  orderId: string;
  folio: number;
  totalCents: Cents;
  /** Descuento por membresía aplicado (D13). */
  discountCents: Cents;
  courtesyApplied: number;
  /** El `requestId` ya existía: se devuelve el pedido original sin cobrar otra vez. */
  duplicate: boolean;
}

export async function createOrder(deps: CafeteriaDeps, actor: Actor | null, input: CreateOrderInput): Promise<CreateOrderResult> {
  const cashier = requireRole(actor, BAR_ROLES);

  return deps.uow.run(async (tx) => {
    const existing = await tx.orders.findByRequestId(input.requestId);
    if (existing) {
      const items = await tx.orders.itemsOf([existing.id]);
      return {
        orderId: existing.id,
        folio: existing.folio,
        totalCents: existing.totalCents,
        discountCents: existing.discountCents,
        courtesyApplied: items.filter((i) => i.isCourtesy).length,
        duplicate: true,
      };
    }

    const now = deps.clock.now();
    const snapshot = await loadMenuSnapshot(tx);
    const lines = buildOrderLines(input.items, toSellableProducts(snapshot));

    let customer: UserSummary | null = null;
    let customerName: string | null = null;
    if (input.customer.type === 'user') {
      customer = await tx.users.findById(input.customer.userId);
      if (!customer || customer.deletedAt !== null) {
        throw new CafeteriaError('NOT_FOUND', 'El cliente no existe.', 'customer');
      }
    } else if (input.customer.type === 'name') {
      const name = input.customer.name.trim();
      if (name.length > CUSTOMER_NAME_MAX) throw invalid(`Máximo ${CUSTOMER_NAME_MAX} caracteres.`, 'customer');
      customerName = name === '' ? null : name;
    }

    // Cortesías: el candado por cliente va antes de contar saldos (§5, concurrencia).
    const courtesyLines = lines.map((line, index) => ({ line, key: `line-${index}` })).filter(({ line }) => line.isCourtesy);
    const sourceOf = new Map<string, string>();
    if (courtesyLines.length > 0) {
      if (!customer) {
        throw new CafeteriaError('COURTESY_NOT_ALLOWED', 'Elige al cliente registrado para aplicar cortesías.', 'customer');
      }
      await tx.courtesy.lockCustomer(customer.id);
      const { sources } = await loadCustomerCourtesy(tx, deps.clock, customer, snapshot, now);
      const allocation = allocateCourtesies(
        courtesyLines.map(({ line, key }) => ({
          key,
          item: { productId: line.productId, categoryId: line.categoryId, rootCategoryId: line.rootCategoryId },
        })),
        sources
      );
      if (allocation.uncovered.length > 0) {
        const names = allocation.uncovered.map((key) => courtesyLines.find((c) => c.key === key)!.line.productName);
        throw new CafeteriaError(
          'COURTESY_NOT_ALLOWED',
          `Sin cortesía disponible para: ${names.join(', ')}.`,
          'items',
          { uncovered: names }
        );
      }
      for (const [key, sourceKey] of allocation.assignments) sourceOf.set(key, sourceKey);
    }

    // D13: el descuento de la membresía activa se calcula aquí, nunca con datos del cliente.
    const subtotalCents = orderTotal(lines);
    const discount = customer ? await tx.memberships.activeBarDiscount(customer.id) : null;
    const appliedDiscount = discount ? discountCents(subtotalCents, discount.percent) : 0;
    const totalCents = subtotalCents - appliedDiscount;
    const paymentMethod = resolvePaymentMethod(totalCents, input.paymentMethod);
    let bankAccountId: string | null = null;
    if (paymentMethod === 'transfer') {
      const account = await tx.bank.getBarAccount();
      if (!account) {
        throw new CafeteriaError('NO_BAR_ACCOUNT', 'No hay cuenta bancaria marcada para la barra.', 'paymentMethod');
      }
      bankAccountId = account.id;
    }

    const period = deps.clock.yearMonth(now);
    const items: NewOrderItem[] = lines.map((line, index) => {
      const source = sourceOf.get(`line-${index}`);
      return {
        productId: line.productId,
        productName: line.productName,
        categoryName: line.categoryName,
        parentCategoryName: line.parentCategoryName,
        temperature: line.temperature,
        unitPriceCents: line.unitPriceCents,
        quantity: line.quantity,
        isCourtesy: line.isCourtesy,
        courtesyUserId: line.isCourtesy ? customer!.id : null,
        courtesySource: source === undefined ? null : source === 'monthly' ? 'monthly' : 'grant',
        courtesyPeriod: source === 'monthly' ? period : null,
        courtesyGrantId: source !== undefined && source !== 'monthly' ? source : null,
        lineTotalCents: line.lineTotalCents,
      };
    });

    const order = await tx.orders.insert(
      {
        requestId: input.requestId,
        customerName,
        customerUserId: customer?.id ?? null,
        paymentMethod,
        bankAccountId,
        totalCents,
        subtotalCents,
        discountCents: appliedDiscount,
        discountPercent: appliedDiscount > 0 ? discount!.percent : 0,
        discountLabel: appliedDiscount > 0 ? discount!.label : null,
        createdBy: cashier.id,
        createdAt: now,
      },
      items
    );

    return { orderId: order.id, folio: order.folio, totalCents, discountCents: appliedDiscount, courtesyApplied: courtesyLines.length, duplicate: false };
  });
}
