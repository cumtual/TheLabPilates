'use server';

import { getSalesReport, type SalesReport } from '../../application/use-cases/sales';
import { voidOrder } from '../../application/use-cases/void-order';
import { resolveClosing, retryClosingEmail } from '../../application/use-cases/closings';
import {
  grantCourtesy,
  listCourtesyGrants,
  revokeCourtesy,
  searchCustomers,
  updateCourtesyRules,
} from '../../application/use-cases/courtesies';
import { ADMIN_ONLY } from '../../application/shared';
import {
  courtesyRulesSchema,
  grantListSchema,
  grantSchema,
  resolveClosingSchema,
  retryEmailSchema,
  revokeSchema,
  salesReportSchema,
  searchSchema,
  voidOrderSchema,
} from '../schemas';
import { runAction } from '../run-action';
import type { FormActionResult } from '@/lib/types/actions';

/** Acciones solo de admin: ventas, anulación, cortes y cortesías. */

/** A5: se llama al abrir, al filtrar o con «Actualizar»; nunca en intervalos. */
export async function getSalesReportAction(input: unknown): Promise<FormActionResult<SalesReport>> {
  return runAction({ roles: ADMIN_ONLY, schema: salesReportSchema, input, run: (deps, actor, data) => getSalesReport(deps, actor, data) });
}

export async function voidOrderAction(input: unknown) {
  return runAction({ roles: ADMIN_ONLY, schema: voidOrderSchema, input, message: 'Venta anulada.', run: (deps, actor, data) => voidOrder(deps, actor, data) });
}

export async function resolveClosingAction(input: unknown) {
  return runAction({
    roles: ADMIN_ONLY,
    schema: resolveClosingSchema,
    input,
    message: 'Corte cerrado.',
    run: async (deps, actor, data) => {
      const { closing, emailSent } = await resolveClosing(
        deps,
        actor,
        data.outcome === 'received_all'
          ? { closingId: data.closingId, outcome: 'received_all' }
          : { closingId: data.closingId, outcome: 'received_partial', cashReceivedCents: data.cashReceived, note: data.note }
      );
      return { status: closing.status, emailSent };
    },
  });
}

export async function retryClosingEmailAction(input: unknown) {
  return runAction({ roles: ADMIN_ONLY, schema: retryEmailSchema, input, run: (deps, actor, data) => retryClosingEmail(deps, actor, data) });
}

export async function updateCourtesyRulesAction(input: unknown) {
  return runAction({ roles: ADMIN_ONLY, schema: courtesyRulesSchema, input, message: 'Reglas guardadas.', run: (deps, actor, data) => updateCourtesyRules(deps, actor, data) });
}

export async function grantCourtesyAction(input: unknown) {
  return runAction({
    roles: ADMIN_ONLY,
    schema: grantSchema,
    input,
    message: 'Cortesías regaladas.',
    run: async (deps, actor, data) => ({ id: (await grantCourtesy(deps, actor, data)).id }),
  });
}

export async function revokeCourtesyAction(input: unknown) {
  return runAction({ roles: ADMIN_ONLY, schema: revokeSchema, input, message: 'Regalo revocado.', run: (deps, actor, data) => revokeCourtesy(deps, actor, data) });
}

export async function listCourtesyGrantsAction(input: unknown) {
  return runAction({ roles: ADMIN_ONLY, schema: grantListSchema, input, run: (deps, actor, data) => listCourtesyGrants(deps, actor, data) });
}

/** Buscar a quién regalar (mismo límite de 8 resultados que la caja). */
export async function searchUsersForGrantAction(q: unknown) {
  return runAction({ roles: ADMIN_ONLY, schema: searchSchema, input: { q }, run: (deps, actor, data) => searchCustomers(deps, actor, data) });
}
