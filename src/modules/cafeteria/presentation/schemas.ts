import { z } from 'zod';
import { MAX_AMOUNT_CENTS, MAX_PRICE_CENTS, parsePesos } from '../domain/money';
import { MAX_LINE_QUANTITY, MAX_ORDER_LINES } from '../domain/order';
import { GRANT_QUANTITY_MAX, GRANT_QUANTITY_MIN } from '../domain/courtesy-grants';

/**
 * Esquemas Zod de las Server Actions (SPEC-CAFETERIA §5). Los montos llegan como texto
 * con centavos (`'42.50'`) y salen en centavos enteros. Los usa también la UI.
 */

const uuid = z.uuid('Identificador no válido.');

/** Texto en pesos → centavos, con el mensaje de `parsePesos`. */
export function pesos(max: number = MAX_PRICE_CENTS, { allowZero = false } = {}) {
  return z.string().transform((value, ctx) => {
    const parsed = parsePesos(value, { max });
    if (!parsed.ok) {
      ctx.addIssue({ code: 'custom', message: parsed.error });
      return z.NEVER;
    }
    if (!allowZero && parsed.cents === 0) {
      ctx.addIssue({ code: 'custom', message: 'El monto debe ser mayor a $0.00.' });
      return z.NEVER;
    }
    return parsed.cents;
  });
}

const temperature = z.enum(['cold', 'hot']).nullable();
const sortOrder = z.coerce.number().int('Usa un número entero.').min(0, 'Mínimo 0.').max(9999, 'Máximo 9999.').default(0);

export const categorySchema = z.object({
  name: z.string().trim().min(1, 'Escribe el nombre.').max(60, 'Máximo 60 caracteres.'),
  parentId: uuid.nullable(),
  usesTemperature: z.boolean(),
  sortOrder,
  isActive: z.boolean(),
});

export const productSchema = z.object({
  categoryId: uuid,
  name: z.string().trim().min(1, 'Escribe el nombre.').max(80, 'Máximo 80 caracteres.'),
  price: pesos(),
  temperature,
  sortOrder,
  isActive: z.boolean(),
  isAvailable: z.boolean(),
});

export const orderSchema = z.object({
  requestId: uuid,
  customer: z.discriminatedUnion('type', [
    z.object({ type: z.literal('none') }),
    z.object({ type: z.literal('name'), name: z.string().max(100, 'Máximo 100 caracteres.') }),
    z.object({ type: z.literal('user'), userId: uuid }),
  ]),
  items: z
    .array(
      z.object({
        productId: uuid,
        quantity: z.number().int().min(1).max(MAX_LINE_QUANTITY),
        courtesy: z.boolean(),
      })
    )
    .min(1, 'Agrega al menos un artículo.')
    .max(MAX_ORDER_LINES, `Máximo ${MAX_ORDER_LINES} líneas por pedido.`),
  paymentMethod: z.enum(['cash', 'transfer']).nullable(),
});

export const searchSchema = z.object({ q: z.string().max(100) });

export const closingSchema = z.object({
  cashDelivered: pesos(MAX_AMOUNT_CENTS, { allowZero: true }),
  deliveryNote: z.string().max(500, 'Máximo 500 caracteres.').optional().nullable(),
  expectedOrdersCount: z.number().int().min(0),
  expectedCashTotalCents: z.number().int().min(0),
});

export const resolveClosingSchema = z.discriminatedUnion('outcome', [
  z.object({ closingId: uuid, outcome: z.literal('received_all') }),
  z.object({
    closingId: uuid,
    outcome: z.literal('received_partial'),
    cashReceived: pesos(MAX_AMOUNT_CENTS, { allowZero: true }),
    note: z.string().trim().min(1, 'Explica el faltante.').max(500, 'Máximo 500 caracteres.'),
  }),
]);

export const retryEmailSchema = z.object({ closingId: uuid, which: z.enum(['created', 'resolved']) });

export const voidOrderSchema = z.object({
  orderId: uuid,
  reason: z.string().trim().min(1, 'Escribe el motivo de la anulación.').max(500, 'Máximo 500 caracteres.'),
});

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha no válida.');

export const salesReportSchema = z.object({
  from: ymd,
  to: ymd,
  method: z.enum(['cash', 'transfer', 'courtesy']).nullable().optional(),
  status: z.enum(['all', 'paid', 'voided']).optional(),
  q: z.string().max(100).optional(),
  page: z.number().int().min(1).optional(),
});

export const courtesyRulesSchema = z.object({
  limit: z.number().int('Usa un número entero.').min(0, 'Mínimo 0.').max(31, 'Máximo 31.'),
  notifyEmails: z.array(z.string().trim().email('Correo no válido.')).min(1, 'Agrega al menos un correo.').max(10, 'Máximo 10 correos.'),
  categories: z.array(z.object({ id: uuid, eligible: z.boolean().nullable() })).max(500),
  products: z.array(z.object({ id: uuid, override: z.boolean().nullable() })).max(2000),
});

export const grantSchema = z.object({
  userId: uuid,
  quantity: z.number().int().min(GRANT_QUANTITY_MIN, `Mínimo ${GRANT_QUANTITY_MIN}.`).max(GRANT_QUANTITY_MAX, `Máximo ${GRANT_QUANTITY_MAX}.`),
  scope: z.discriminatedUnion('type', [
    z.object({ type: z.literal('any') }),
    z.object({ type: z.literal('category'), categoryId: uuid }),
    z.object({ type: z.literal('product'), productId: uuid }),
  ]),
  expiresOn: ymd.nullable().optional(),
  note: z.string().max(500, 'Máximo 500 caracteres.').nullable().optional(),
});

export const revokeSchema = z.object({
  grantId: uuid,
  reason: z.string().trim().min(1, 'Escribe el motivo.').max(500, 'Máximo 500 caracteres.'),
});

export const grantListSchema = z.object({
  userQuery: z.string().max(100).optional(),
  status: z.enum(['active', 'used', 'expired', 'revoked', 'unavailable']).optional(),
});

export const idSchema = uuid;
