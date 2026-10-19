'use server';

import { customerSearchRateLimiter } from '@/lib/auth/rate-limiter';
import type { FormActionResult } from '@/lib/types/actions';
import { createOrder, type CreateOrderResult } from '../../application/use-cases/create-order';
import { createClosing } from '../../application/use-cases/closings';
import { searchCustomers, type CustomerResult } from '../../application/use-cases/courtesies';
import { BAR_ROLES } from '../../application/shared';
import { closingSchema, orderSchema, searchSchema } from '../schemas';
import { currentActor, failure, FORBIDDEN_ERROR, runAction } from '../run-action';
import { cafeteriaDeps } from '../../infrastructure/container';

/** Caja y corte de la barra (barra y admin). */

export async function createOrderAction(input: unknown): Promise<FormActionResult<CreateOrderResult>> {
  return runAction({ roles: BAR_ROLES, schema: orderSchema, input, run: (deps, actor, data) => createOrder(deps, actor, data) });
}

/** §9: 60 búsquedas por minuto por usuario; solo nombre, correo, rol y cortesías. */
export async function searchCustomersAction(q: unknown): Promise<FormActionResult<CustomerResult[]>> {
  const actor = await currentActor();
  if (!actor || !BAR_ROLES.includes(actor.role)) return { success: false, error: FORBIDDEN_ERROR };
  if (customerSearchRateLimiter.isRateLimited(actor.id)) {
    return { success: false, error: 'Demasiadas búsquedas. Espera un minuto.' };
  }
  customerSearchRateLimiter.recordAttempt(actor.id);
  const parsed = searchSchema.safeParse({ q });
  if (!parsed.success) return { success: false, error: 'Búsqueda no válida.' };
  try {
    return { success: true, data: await searchCustomers(cafeteriaDeps(), actor, parsed.data) };
  } catch (error) {
    return failure(error);
  }
}

export async function createClosingAction(input: unknown) {
  return runAction({
    roles: BAR_ROLES,
    schema: closingSchema,
    input,
    run: async (deps, actor, { cashDelivered, ...rest }) => {
      const { closing, emailSent } = await createClosing(deps, actor, { ...rest, cashDeliveredCents: cashDelivered });
      return { closingId: closing.id, emailSent };
    },
  });
}
