import { CafeteriaError } from '../../domain/errors';
import type { Actor, CafeteriaDeps } from '../ports';
import { ADMIN_ONLY, requireRole, requiredText } from '../shared';

/**
 * Anular una venta (SPEC-CAFETERIA D8): solo el admin, con motivo y antes del corte.
 * Anular devuelve las cortesías solas: los saldos se cuentan sobre pedidos `paid`.
 */
export async function voidOrder(deps: CafeteriaDeps, actor: Actor | null, input: { orderId: string; reason: string }): Promise<{ folio: number }> {
  const admin = requireRole(actor, ADMIN_ONLY);
  const reason = requiredText(input.reason, 'Escribe el motivo de la anulación.', 'reason');

  return deps.uow.run(async (tx) => {
    const order = await tx.orders.findById(input.orderId);
    if (!order) throw new CafeteriaError('NOT_FOUND', 'El pedido no existe.');
    if (order.status === 'voided') throw new CafeteriaError('ALREADY_VOIDED', 'Este pedido ya está anulado.');
    if (order.closingId !== null) throw new CafeteriaError('ORDER_CLOSED', 'Este pedido ya está en un corte; no se puede anular.');
    const done = await tx.orders.void(order.id, { voidedAt: deps.clock.now(), voidedBy: admin.id, voidReason: reason });
    if (!done) throw new CafeteriaError('CONFLICT', 'El pedido cambió mientras lo anulabas. Actualiza e intenta de nuevo.');
    return { folio: order.folio };
  });
}
